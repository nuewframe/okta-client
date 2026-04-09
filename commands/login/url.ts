import { Command } from '@cliffy/command';
import { OAuthService } from '../../services/oauth.service.ts';
import {
  applyOAuthExecutionOverrides,
  resolveOAuthExecutionConfig,
  validateOAuthExecutionConfig,
} from '../../config/app.config.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { buildOAuthMetadataOverrides } from '../../utils/oauth-cli-overrides.ts';
import { createPendingLoginState, savePkceState } from '../../utils/pkce.ts';
import { getLoginContext, logContext } from './context.ts';
import type { LoginCommandOptions } from './types.ts';

export const loginUrlCommand = new Command()
  .description('Generate OAuth login URL and save pending PKCE state for manual completion')
  .option('-s, --state <state:string>', 'State parameter (auto-generated when omitted)')
  .option('--nonce <nonce:string>', 'Nonce parameter (auto-generated when omitted)')
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
        state: commandOptions.state,
        nonce: commandOptions.nonce,
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
      logger.info('Login URL:');
      console.log(authUrl);
      logger.info('Pending login state saved. Complete with:');
      logger.info(`Transaction expires at: ${pending.expiresAt}`);
      logger.info('  nfauth login code <code>');
      logger.info('or:');
      logger.info('  nfauth login code --url "<full-redirect-url>"');
    } catch (error) {
      logger.error(
        'Failed to generate login URL:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
