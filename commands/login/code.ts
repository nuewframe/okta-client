import { Command } from '@cliffy/command';
import { OAuthService } from '../../services/oauth.service.ts';
import {
  applyOAuthExecutionOverrides,
  getCurrentAuthConfig,
  loadConfig,
  resolveOAuthExecutionConfig,
  validateOAuthExecutionConfig,
} from '../../config/app.config.ts';
import { saveCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { buildOAuthMetadataOverrides } from '../../utils/oauth-cli-overrides.ts';
import { assertPendingLoginStateValid, clearPkceState, loadPkceState } from '../../utils/pkce.ts';
import { parseCodeFromRedirectUrl } from './flow.ts';
import type { LoginCommandOptions } from './types.ts';

export const loginCodeCommand = new Command()
  .description('Complete login by exchanging an authorization code for tokens')
  .arguments('[code:string]')
  .option('--url <url:string>', 'Full redirect URL containing ?code= and optional state')
  .option('--token-url <url:string>', 'Override token endpoint URL for this exchange')
  .option('--client-id <id:string>', 'Override OAuth client ID for this exchange')
  .option('--client-secret <secret:string>', 'Override OAuth client secret for this exchange')
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
  .action(async (options, codeArg) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginCommandOptions;
      const pending = await loadPkceState();
      assertPendingLoginStateValid(pending);

      if (commandOptions.env && commandOptions.env !== pending.env) {
        throw new Error(
          `Pending login was started for env '${pending.env}', but '${commandOptions.env}' was provided.`,
        );
      }

      const pendingProfile = pending.profile;
      const requestedProfile = commandOptions.profile;
      if (requestedProfile && requestedProfile !== pendingProfile) {
        throw new Error(
          `Pending login was started for profile '${pendingProfile}', but '${requestedProfile}' was provided.`,
        );
      }

      const config = loadConfig();
      const authConfig = getCurrentAuthConfig(config, pending.env, pendingProfile);

      // Validate execution-stage config (grant-specific required fields, safety rules)
      const baseConfig = {
        ...resolveOAuthExecutionConfig(authConfig, 'authorization_code'),
        redirectUrl: pending.redirectUri,
        scope: pending.scope,
      };
      const mode = commandOptions.clientCredentialsMode?.trim();
      if (mode && mode !== 'basic' && mode !== 'in_body' && mode !== 'none') {
        throw new Error(
          'Configuration error: --client-credentials-mode must be one of basic, in_body, none.',
        );
      }

      const resolvedConfig = applyOAuthExecutionOverrides(baseConfig, {
        tokenUrl: commandOptions.tokenUrl?.trim() || undefined,
        clientId: commandOptions.clientId?.trim() || undefined,
        clientSecret: commandOptions.clientSecret?.trim() || undefined,
        clientCredentialsMode: mode as 'basic' | 'in_body' | 'none' | undefined,
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

      let code = codeArg;

      if (!code && commandOptions.url) {
        code = parseCodeFromRedirectUrl(commandOptions.url, pending.state);
      }

      if (!code) {
        throw new Error(
          'No authorization code provided. Use login code <code> or --url <full-url>.',
        );
      }

      logger.info('Exchanging authorization code for tokens...');
      logger.info(`Environment: ${pending.env}`);
      logger.info(`Profile: ${pendingProfile}`);
      logger.info(`Domain: ${authConfig.domain}`);

      const tokens = await oauthService.exchangeCodeForTokens(code, pending.codeVerifier);
      await saveCredentials(tokens);
      await clearPkceState();

      logger.success('Login successful! Credentials saved to ~/.nuewframe/credential.json');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`Token Type: ${tokens.token_type}`);
      if (tokens.id_token) {
        logger.info(`ID Token: ${tokens.id_token.substring(0, 50)}...`);
      }
      if (tokens.refresh_token) {
        logger.info('Refresh Token: Available');
      }
    } catch (error) {
      logger.error('Code exchange failed:', error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  });
