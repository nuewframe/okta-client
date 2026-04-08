import { Command } from '@cliffy/command';
import { OktaService } from '../../services/okta.service.ts';
import { getCurrentOktaConfig, loadConfig } from '../../config/app.config.ts';
import { saveCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { buildOktaServiceConfig } from '../../utils/okta-service-options.ts';
import { assertPendingLoginStateValid, clearPkceState, loadPkceState } from '../../utils/pkce.ts';
import { parseCodeFromRedirectUrl } from './flow.ts';
import type { LoginCommandOptions } from './types.ts';

export const loginCodeCommand = new Command()
  .description('Complete login by exchanging an authorization code for tokens')
  .arguments('[code:string]')
  .option('--url <url:string>', 'Full redirect URL containing ?code= and optional state')
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

      if (commandOptions.namespace && commandOptions.namespace !== pending.namespace) {
        throw new Error(
          `Pending login was started for namespace '${pending.namespace}', but '${commandOptions.namespace}' was provided.`,
        );
      }

      const config = loadConfig();
      const oktaConfig = getCurrentOktaConfig(config, pending.env, pending.namespace);
      const oktaServiceConfig = buildOktaServiceConfig({
        ...oktaConfig,
        redirectUri: pending.redirectUri,
        scope: pending.scope,
      });
      const oktaService = new OktaService(oktaServiceConfig);

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
      logger.info(`Namespace: ${pending.namespace}`);
      logger.info(`Domain: ${oktaConfig.domain}`);

      const tokens = await oktaService.exchangeCodeForTokens(code, pending.codeVerifier);
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
