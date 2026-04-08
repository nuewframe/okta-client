import { Command } from '@cliffy/command';
import { OktaLoginService } from '../../services/okta-login.service.ts';
import type { OktaLoginConfig } from '../../services/okta-login.service.ts';
import { saveCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { getLoginContext, logContext } from './context.ts';
import { promptPassword } from './flow.ts';
import type { LoginCommandOptions } from './types.ts';

export const loginPasswordCommand = new Command()
  .description('Direct login with username/password (high-trust or legacy path)')
  .arguments('<username:string>')
  .action(async (options, username) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginCommandOptions;
      const context = getLoginContext(commandOptions);
      if (!context.oktaConfig.redirectUri) {
        throw new Error(
          'Missing redirectUri in selected Okta configuration. Set redirectUri in config.yaml for this env/namespace.',
        );
      }

      const authorizationServerId = context.oktaConfig.authorizationServerId || 'default';
      const loginConfig: OktaLoginConfig = {
        issuer: `${context.oktaConfig.domain}/oauth2/${authorizationServerId}`,
        clientId: context.oktaConfig.clientId,
        redirectUri: context.oktaConfig.redirectUri,
        scope: context.oktaConfig.scope || 'openid profile email',
      };

      const loginService = new OktaLoginService(loginConfig);

      logger.info('Attempting password login...');
      logContext(logger, context);

      const password = await promptPassword('Enter password: ');
      const tokens = await loginService.login({ username, password });
      await saveCredentials(tokens);

      logger.success('Login successful');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`ID Token: ${tokens.id_token.substring(0, 50)}...`);
      logger.info(`Token Type: ${tokens.token_type}`);
      logger.info(`Expires In: ${tokens.expires_in} seconds`);
      logger.success('Tokens saved to ~/.nuewframe/credential.json');
    } catch (error) {
      logger.error(
        'Password login failed:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
