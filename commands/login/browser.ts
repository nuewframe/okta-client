import { Command } from '@cliffy/command';
import { OAuthService } from '../../services/oauth.service.ts';
import {
  applyOAuthExecutionOverrides,
  resolveOAuthExecutionConfig,
  validateOAuthExecutionConfig,
} from '../../config/app.config.ts';
import { saveCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { buildOAuthMetadataOverrides } from '../../utils/oauth-cli-overrides.ts';
import { clearPkceState, createPendingLoginState, savePkceState } from '../../utils/pkce.ts';
import { loginViaCdp } from '../../utils/cdp.ts';
import { getLoginContext, logContext } from './context.ts';
import { openBrowser } from './flow.ts';
import type { LoginCommandOptions } from './types.ts';

export const loginBrowserCommand = new Command()
  .description(
    'Login via browser (default interactive flow). Falls back to manual completion when needed',
  )
  .option('--redirect-uri <uri:string>', 'Override redirect URI for this login flow')
  .option('--scope <scope:string>', 'Override OAuth scope for this login flow')
  .option('--auth-url <url:string>', 'Override authorization endpoint URL for this login flow')
  .option('--token-url <url:string>', 'Override token endpoint URL for this login flow')
  .option('--client-id <id:string>', 'Override OAuth client ID for this login flow')
  .option('--client-secret <secret:string>', 'Override OAuth client secret for this login flow')
  .option('--param <pairs:string>', 'Override request params for all OAuth requests (k=v,k2=v2)')
  .option('--param-auth <pairs:string>', 'Override request params for authorize request only')
  .option('--param-token <pairs:string>', 'Override request params for token request only')
  .option('--header <pairs:string>', 'Override request headers for all token requests (k=v,k2=v2)')
  .option('--header-auth <pairs:string>', 'Override request headers for authorize request only')
  .option('--header-token <pairs:string>', 'Override request headers for token request only')
  .option(
    '--client-credentials-mode <mode:string>',
    'Client authentication mode: basic, in_body, or none',
  )
  .option(
    '--port <port:number>',
    'Local callback port for localhost redirect URIs when no auto-capture is available',
    { default: 7879 },
  )
  .action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginCommandOptions;
      const context = getLoginContext(commandOptions);
      const effectiveRedirectUri = commandOptions.redirectUri ?? context.authConfig.redirectUri;
      if (!effectiveRedirectUri) {
        throw new Error(
          'No redirect URI configured. Set redirectUri in config.yaml or pass --redirect-uri.',
        );
      }

      // Validate execution-stage config (grant-specific required fields, safety rules)
      const baseConfig = {
        ...resolveOAuthExecutionConfig(context.authConfig, 'authorization_code'),
        redirectUrl: effectiveRedirectUri,
      };
      const mode = commandOptions.clientCredentialsMode?.trim();
      if (mode && mode !== 'basic' && mode !== 'in_body' && mode !== 'none') {
        throw new Error(
          'Configuration error: --client-credentials-mode must be one of basic, in_body, none.',
        );
      }

      const resolvedConfig = applyOAuthExecutionOverrides(baseConfig, {
        authUrl: commandOptions.authUrl?.trim() || undefined,
        tokenUrl: commandOptions.tokenUrl?.trim() || undefined,
        redirectUrl: effectiveRedirectUri,
        clientId: commandOptions.clientId?.trim() || undefined,
        clientSecret: commandOptions.clientSecret?.trim() || undefined,
        clientCredentialsMode: mode as 'basic' | 'in_body' | 'none' | undefined,
        scope: commandOptions.scope?.trim() || undefined,
        ...buildOAuthMetadataOverrides(commandOptions),
      });
      validateOAuthExecutionConfig(resolvedConfig, 'security.auth');

      if (!resolvedConfig.authUrl || !resolvedConfig.tokenUrl) {
        throw new Error(
          'Configuration error: authUrl and tokenUrl are required for authorization_code.',
        );
      }

      const oauthService = new OAuthService({
        authUrl: resolvedConfig.authUrl,
        tokenUrl: resolvedConfig.tokenUrl,
        redirectUrl: resolvedConfig.redirectUrl,
        clientId: resolvedConfig.clientId,
        clientSecret: resolvedConfig.clientSecret,
        scope: resolvedConfig.scope,
        clientCredentialsMode: resolvedConfig.clientCredentialsMode,
        customRequestParameters: resolvedConfig.customRequestParameters,
        customRequestHeaders: resolvedConfig.customRequestHeaders,
      });

      const pending = await createPendingLoginState({
        env: context.env,
        profile: context.profile,
        redirectUri: effectiveRedirectUri,
        scope: resolvedConfig.scope,
      });
      await savePkceState(pending);

      const authUrl = oauthService.getAuthorizeUrl({
        state: pending.state,
        nonce: pending.nonce,
        codeChallenge: pending.codeChallenge,
        codeChallengeMethod: resolvedConfig.pkceCodeChallengeMethod,
      });

      logContext(logger, context);
      logger.info(`Redirect URI: ${effectiveRedirectUri}`);
      logger.info('Opening browser for authentication...');

      let code: string;
      try {
        // Try CDP-based interception first (works with any redirect URI)
        logger.debug('Attempting automatic code capture via Chrome DevTools Protocol...');
        code = await loginViaCdp(authUrl, effectiveRedirectUri, pending.state);
        logger.success('Authentication captured automatically');
      } catch (cdpError) {
        // CDP failed (e.g., no Chromium browser available)
        const cdpMessage = cdpError instanceof Error ? cdpError.message : String(cdpError);
        logger.info(`⚠️ Auto-capture failed: ${cdpMessage}`);
        logger.info('Falling back to manual completion.');
        logger.info('Opening browser. If it does not open, use this URL:');
        console.log(authUrl);
        await openBrowser(authUrl);
        logger.info('Complete manually with:');
        logger.info(`Transaction expires at: ${pending.expiresAt}`);
        logger.info('  nfauth login code <code>');
        logger.info('or:');
        logger.info('  nfauth login code --url "<full-redirect-url>"');
        await clearPkceState();
        return;
      }

      const tokens = await oauthService.exchangeCodeForTokens(code, pending.codeVerifier);
      await saveCredentials(tokens);
      await clearPkceState();

      logger.success('Login successful! Credentials saved to ~/.nuewframe/credential.json');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`Expires in: ${tokens.expires_in}s`);
    } catch (error) {
      logger.error('Browser login failed:', error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  });
