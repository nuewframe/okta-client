import { Command } from '@cliffy/command';
import { loadCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';

function buildRawTokenCommand(
  tokenName: 'access' | 'id' | 'refresh',
  description: string,
): Command {
  return new Command().description(description).action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const credentials = await loadCredentials();
      const token = tokenName === 'access'
        ? credentials.access_token
        : tokenName === 'id'
        ? credentials.id_token
        : credentials.refresh_token;

      if (!token) {
        throw new Error(`No ${tokenName} token found in credential file.`);
      }
      console.log(token);
    } catch (error) {
      logger.error(
        `Failed to get ${tokenName} token:`,
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
}

export const tokenAccessCommand = buildRawTokenCommand('access', 'Print the saved access token');
export const tokenIdCommand = buildRawTokenCommand('id', 'Print the saved ID token');
export const tokenRefreshCommand = buildRawTokenCommand('refresh', 'Print the saved refresh token');
