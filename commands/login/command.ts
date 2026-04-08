import { Command } from '@cliffy/command';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { loginBrowserCommand } from './browser.ts';
import { loginCodeCommand } from './code.ts';
import { loginPasswordCommand } from './password.ts';
import { loginUrlCommand } from './url.ts';

export const loginCommand = new Command()
  .description('End-user login flows')
  .action((options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    logger.info('Use one of the login subcommands: browser, url, code, password');
    logger.info("Run 'okta-client login --help' for more information");
  })
  .command('browser', loginBrowserCommand)
  .command('url', loginUrlCommand)
  .command('code', loginCodeCommand)
  .command('password', loginPasswordCommand);
