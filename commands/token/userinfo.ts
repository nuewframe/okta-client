import { Command } from '@cliffy/command';
import { OAuthService } from '../../services/oauth.service.ts';
import {
  applyOAuthExecutionOverrides,
  getCurrentAuthConfig,
  loadConfig,
  resolveConfigSelection,
  resolveOAuthExecutionConfig,
  validateOAuthExecutionConfig,
} from '../../config/app.config.ts';
import { loadCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import type { TokenCommandOptions } from './types.ts';

export const tokenUserInfoCommand = new Command()
  .description('Fetch user information using saved or provided access token')
  .option('--token <token:string>', 'Use a provided access token')
  .option(
    '--token-url <url:string>',
    'Override token endpoint URL (also affects derived userinfo URL)',
  )
  .option('--userinfo-url <url:string>', 'Override userinfo endpoint URL directly')
  .option('--client-id <id:string>', 'Override OAuth client ID')
  .action(async (options: TokenCommandOptions) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const config = loadConfig();
      const selection = resolveConfigSelection(config, options.env, options.profile);
      const authConfig = getCurrentAuthConfig(config, selection.env, selection.profile);
      const baseConfig = resolveOAuthExecutionConfig(authConfig, 'authorization_code');
      const resolvedConfig = applyOAuthExecutionOverrides(baseConfig, {
        tokenUrl: options.tokenUrl?.trim() || undefined,
        clientId: options.clientId?.trim() || undefined,
      });
      validateOAuthExecutionConfig(resolvedConfig, 'security.auth');

      if (!resolvedConfig.authUrl || !resolvedConfig.tokenUrl) {
        throw new Error(
          'Configuration error: authUrl and tokenUrl are required for token userinfo.',
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

      const userInfoUrlOverride = options.userinfoUrl?.trim() || undefined;
      let tokenToUse = options.token;
      if (!tokenToUse) {
        const credentials = await loadCredentials();
        tokenToUse = credentials.access_token;
      }

      if (!tokenToUse) {
        throw new Error('No access token found in credential file.');
      }

      const userInfo = await oauthService.getUserInfo(tokenToUse, userInfoUrlOverride);
      console.log(JSON.stringify(userInfo, null, 2));
    } catch (error) {
      logger.error(
        'Failed to get user info:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
