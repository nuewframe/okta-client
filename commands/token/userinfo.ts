import { Command } from '@cliffy/command';
import { OktaService } from '../../services/okta.service.ts';
import {
  getCurrentOktaConfig,
  loadConfig,
  resolveConfigSelection,
} from '../../config/app.config.ts';
import { loadCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { buildOktaServiceConfig } from '../../utils/okta-service-options.ts';
import type { TokenCommandOptions } from './types.ts';

export const tokenUserInfoCommand = new Command()
  .description('Fetch user information using saved or provided access token')
  .option('--token <token:string>', 'Use a provided access token')
  .action(async (options: TokenCommandOptions) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const config = loadConfig();
      const selection = resolveConfigSelection(config, options.env, options.namespace);
      const oktaConfig = getCurrentOktaConfig(config, selection.env, selection.namespace);
      const oktaServiceConfig = buildOktaServiceConfig(oktaConfig);
      const oktaService = new OktaService(oktaServiceConfig);

      let tokenToUse = options.token;
      if (!tokenToUse) {
        const credentials = await loadCredentials();
        tokenToUse = credentials.access_token;
      }

      if (!tokenToUse) {
        throw new Error('No access token found in credential file.');
      }

      const userInfo = await oktaService.getUserInfo(tokenToUse);
      console.log(JSON.stringify(userInfo, null, 2));
    } catch (error) {
      logger.error(
        'Failed to get user info:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
