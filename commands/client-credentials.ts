import { Command } from '@cliffy/command';
import { OktaService } from '../services/okta.service.ts';
import { getCurrentOktaConfig, loadConfig, resolveConfigSelection } from '../config/app.config.ts';
import { buildOktaServiceConfig } from '../utils/okta-service-options.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';

interface ClientCredentialsOptions {
  env?: string;
  namespace?: string;
  scope: string;
  logLevel?: string;
  verbose?: boolean;
}

export const clientCredentialsCommand = new Command()
  .description('Get client credentials token')
  .option('-e, --env <env:string>', 'Environment to use (overrides current config env)')
  .option('-s, --scope <scope:string>', 'Scope for the token', { default: 'openid profile email' })
  .action(async (options: ClientCredentialsOptions) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const scope = options.scope?.trim();
      if (!scope) {
        logger.error('Scope must be a non-empty string.');
        Deno.exit(1);
      }

      const config = loadConfig();
      const selection = resolveConfigSelection(config, options.env, options.namespace);
      const oktaConfig = getCurrentOktaConfig(config, selection.env, selection.namespace);

      const oktaServiceConfig = buildOktaServiceConfig(oktaConfig, scope);

      const oktaService = new OktaService(oktaServiceConfig);

      logger.info('Getting client credentials token...');
      logger.info(`Environment: ${selection.env}`);
      logger.info(`Namespace: ${selection.namespace}`);
      logger.info(`Domain: ${oktaConfig.domain}`);
      logger.info(`Client ID: ${oktaConfig.clientId}`);
      logger.info(`Scope: ${scope}`);

      const tokens = await oktaService.getClientCredentialsTokens(scope);

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
      logger.info('Make sure your configuration is set up: deno task cli okta config-init');
      Deno.exit(1);
    }
  });
