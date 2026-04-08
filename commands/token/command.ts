import { Command } from '@cliffy/command';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { tokenClaimsCommand } from './claims.ts';
import { tokenInfoCommand } from './info.ts';
import { tokenAccessCommand, tokenIdCommand, tokenRefreshCommand } from './raw-token.ts';
import { tokenUserInfoCommand } from './userinfo.ts';

export const tokenCommand = new Command()
  .description('Inspect saved tokens and query token-based information')
  .action((options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    logger.info('Use one of the token subcommands: info, access, id, refresh, claims, userinfo');
    logger.info("Run 'okta-client token --help' for more information");
  })
  .command('info', tokenInfoCommand)
  .command('access', tokenAccessCommand)
  .command('id', tokenIdCommand)
  .command('refresh', tokenRefreshCommand)
  .command('claims', tokenClaimsCommand)
  .command('userinfo', tokenUserInfoCommand);
