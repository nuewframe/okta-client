import { Command } from '@cliffy/command';
import { loadCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import type { TokenCommandOptions } from './types.ts';
import { printClaims } from './claims-utils.ts';

export const tokenClaimsCommand = new Command()
  .description('Inspect JWT claims from saved tokens or a provided token')
  .option('--token <token:string>', 'Decode a provided token instead of saved credentials')
  .action(async (options: TokenCommandOptions) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      let tokenToDecode = options.token;
      let tokenLabel = 'provided token';

      if (!tokenToDecode) {
        const credentials = await loadCredentials();
        tokenToDecode = credentials.access_token;
        tokenLabel = 'saved access token';
      }

      if (!tokenToDecode) {
        throw new Error('No token available to decode.');
      }

      logger.info(`Decoding ${tokenLabel}...`);
      printClaims(tokenToDecode, tokenLabel);
    } catch (error) {
      logger.error(
        'Failed to decode token claims:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  })
  .command(
    'access',
    new Command()
      .description('Decode claims from the saved access token')
      .action(async (options) => {
        const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
        try {
          const credentials = await loadCredentials();
          printClaims(credentials.access_token, 'saved access token');
        } catch (error) {
          logger.error(
            'Failed to decode access token claims:',
            error instanceof Error ? error.message : String(error),
          );
          Deno.exit(1);
        }
      }),
  )
  .command(
    'id',
    new Command()
      .description('Decode claims from the saved ID token')
      .action(async (options) => {
        const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
        try {
          const credentials = await loadCredentials();
          if (!credentials.id_token) {
            throw new Error('No ID token found in credential file.');
          }
          printClaims(credentials.id_token, 'saved ID token');
        } catch (error) {
          logger.error(
            'Failed to decode ID token claims:',
            error instanceof Error ? error.message : String(error),
          );
          Deno.exit(1);
        }
      }),
  );
