import { Command } from '@cliffy/command';
import { OktaService } from '../services/okta.service.ts';
import { getCurrentOktaConfig, loadConfig, resolveConfigSelection } from '../config/app.config.ts';
import { buildOktaServiceConfig } from '../utils/okta-service-options.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';
import { decodeJwtHeader, decodeJwtPayload } from '../utils/jwt.ts';
import { type CredentialData, loadCredentials } from '../utils/credentials.ts';

interface TokenCommandOptions {
  env?: string;
  namespace?: string;
  token?: string;
  logLevel?: string;
  verbose?: boolean;
}

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

function getExpiryInfo(credentials: CredentialData): { expiresAt: string; expired: boolean } {
  const issuedAt = new Date(credentials.timestamp).getTime();
  const expiresAtMs = issuedAt + credentials.expires_in * 1000;
  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    expired: Date.now() > expiresAtMs,
  };
}

function printClaims(token: string, tokenLabel: string): void {
  if (!isJwt(token)) {
    throw new Error(`${tokenLabel} is not a JWT and cannot be decoded into claims.`);
  }

  const header = decodeJwtHeader(token);
  const payload = decodeJwtPayload(token);

  console.log(JSON.stringify({ header, payload }, null, 2));
}

export const tokenCommand = new Command()
  .description('Inspect saved tokens and query token-based information')
  .action((options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    logger.info('Use one of the token subcommands: info, access, id, refresh, claims, userinfo');
    logger.info("Run 'okta-client token --help' for more information");
  });

const tokenInfoCommand = new Command()
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

const tokenAccessCommand = new Command()
  .description('Print the saved access token')
  .action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const credentials = await loadCredentials();
      if (!credentials.access_token) {
        throw new Error('No access token found in credential file.');
      }
      console.log(credentials.access_token);
    } catch (error) {
      logger.error(
        'Failed to get access token:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });

const tokenIdCommand = new Command()
  .description('Print the saved ID token')
  .action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const credentials = await loadCredentials();
      if (!credentials.id_token) {
        throw new Error('No ID token found in credential file.');
      }
      console.log(credentials.id_token);
    } catch (error) {
      logger.error(
        'Failed to get ID token:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });

const tokenRefreshCommand = new Command()
  .description('Print the saved refresh token')
  .action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const credentials = await loadCredentials();
      if (!credentials.refresh_token) {
        throw new Error('No refresh token found in credential file.');
      }
      console.log(credentials.refresh_token);
    } catch (error) {
      logger.error(
        'Failed to get refresh token:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });

const tokenClaimsCommand = new Command()
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

const tokenUserInfoCommand = new Command()
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

tokenCommand.command('info', tokenInfoCommand);
tokenCommand.command('access', tokenAccessCommand);
tokenCommand.command('id', tokenIdCommand);
tokenCommand.command('refresh', tokenRefreshCommand);
tokenCommand.command('claims', tokenClaimsCommand);
tokenCommand.command('userinfo', tokenUserInfoCommand);
