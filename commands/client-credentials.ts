import { Command } from '@cliffy/command';
import { OAuthService } from '../services/oauth.service.ts';
import {
  applyOAuthExecutionOverrides,
  getCurrentAuthConfig,
  loadConfig,
  resolveConfigSelection,
  resolveOAuthExecutionConfig,
  validateOAuthExecutionConfig,
} from '../config/app.config.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';
import { buildOAuthMetadataOverrides } from '../utils/oauth-cli-overrides.ts';

interface ClientCredentialsOptions {
  env?: string;
  profile?: string;
  scope: string;
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  clientCredentialsMode?: string;
  param?: string;
  paramAuth?: string;
  paramToken?: string;
  header?: string;
  headerAuth?: string;
  headerToken?: string;
  logLevel?: string;
  verbose?: boolean;
}

export const clientCredentialsCommand = new Command()
  .description('Get client credentials token')
  .option('-e, --env <env:string>', 'Environment to use (overrides current config env)')
  .option('-s, --scope <scope:string>', 'Scope for the token', { default: 'openid profile email' })
  .option('--auth-url <url:string>', 'Override authorization endpoint URL for this request')
  .option('--token-url <url:string>', 'Override token endpoint URL for this request')
  .option('--client-id <id:string>', 'Override OAuth client ID for this request')
  .option('--client-secret <secret:string>', 'Override OAuth client secret for this request')
  .option('--param <pairs:string>', 'Override request params for all OAuth requests (k=v,k2=v2)')
  .option('--param-auth <pairs:string>', 'Override request params for authorize request only')
  .option('--param-token <pairs:string>', 'Override request params for token request only')
  .option('--header <pairs:string>', 'Override request headers for all token requests (k=v,k2=v2)')
  .option('--header-auth <pairs:string>', 'Accepted for symmetry; not used in service token flow')
  .option('--header-token <pairs:string>', 'Override request headers for token request only')
  .option(
    '--client-credentials-mode <mode:string>',
    'Client authentication mode: basic, in_body, or none',
  )
  .action(async (options: ClientCredentialsOptions) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const scope = options.scope?.trim();
      if (!scope) {
        logger.error('Scope must be a non-empty string.');
        Deno.exit(1);
      }

      const config = loadConfig();
      const selection = resolveConfigSelection(config, options.env, options.profile);
      const authConfig = getCurrentAuthConfig(config, selection.env, selection.profile);

      // Validate execution-stage config (grant-specific required fields, safety rules)
      const baseConfig = {
        ...resolveOAuthExecutionConfig(authConfig, 'client_credentials'),
        scope,
      };
      const mode = options.clientCredentialsMode?.trim();
      if (mode && mode !== 'basic' && mode !== 'in_body' && mode !== 'none') {
        throw new Error(
          'Configuration error: --client-credentials-mode must be one of basic, in_body, none.',
        );
      }

      const resolvedConfig = applyOAuthExecutionOverrides(baseConfig, {
        authUrl: options.authUrl?.trim() || undefined,
        tokenUrl: options.tokenUrl?.trim() || undefined,
        clientId: options.clientId?.trim() || undefined,
        clientSecret: options.clientSecret?.trim() || undefined,
        clientCredentialsMode: mode as 'basic' | 'in_body' | 'none' | undefined,
        scope,
        ...buildOAuthMetadataOverrides(options),
      });
      validateOAuthExecutionConfig(resolvedConfig, 'security.auth');

      if (!resolvedConfig.authUrl || !resolvedConfig.tokenUrl) {
        throw new Error(
          'Configuration error: authUrl and tokenUrl are required for client_credentials.',
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

      logger.info('Getting client credentials token...');
      logger.info(`Environment: ${selection.env}`);
      logger.info(`Profile: ${selection.profile}`);
      logger.info(`Domain: ${authConfig.domain}`);
      logger.info(`Client ID: ${authConfig.clientId}`);
      logger.info(`Scope: ${scope}`);

      const tokens = await oauthService.getClientCredentialsTokens(scope);

      logger.success('Client credentials token obtained');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`Token Type: ${tokens.token_type}`);
      logger.info(`Expires In: ${tokens.expires_in} seconds`);
      if (tokens.scope) {
        logger.info(`Scope: ${tokens.scope}`);
      }
    } catch (error) {
      logger.error(
        'Failed to get client credentials token:',
        error instanceof Error ? error.message : String(error),
      );
      logger.info('Make sure your configuration is set up: nfauth config init');
      Deno.exit(1);
    }
  });
