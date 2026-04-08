import { Command } from '@cliffy/command';
import { clientCredentialsCommand } from './client-credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';

export const serviceCommand = new Command()
  .description('Service-to-service authorization commands')
  .action((options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    logger.info('Use one of the service subcommands: token');
    logger.info("Run 'okta-client service --help' for more information");
  })
  .command('token', clientCredentialsCommand);
