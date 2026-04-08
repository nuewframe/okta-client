import { Command } from '@cliffy/command';
import { loadCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { getExpiryInfo } from './claims-utils.ts';

export const tokenInfoCommand = new Command()
  .description('Show summary information about saved OAuth/OIDC credentials')
  .action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const credentials = await loadCredentials();
      const expiry = getExpiryInfo(credentials);
      const info = {
        token_type: credentials.token_type,
        scope: credentials.scope,
        saved_at: credentials.timestamp,
        expires_in: credentials.expires_in,
        expires_at: expiry.expiresAt,
        expired: expiry.expired,
        has_id_token: Boolean(credentials.id_token),
        has_refresh_token: Boolean(credentials.refresh_token),
      };

      console.log(JSON.stringify(info, null, 2));
    } catch (error) {
      logger.error(
        'Failed to read token info:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
