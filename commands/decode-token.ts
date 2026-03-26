import { Command } from '@cliffy/command';
import { loadCredentials } from '../utils/credentials.ts';
import { decodeJwtHeader, decodeJwtPayload } from '../utils/jwt.ts';
import { createLoggerFromOptions, type Logger, type LoggingOptions } from '../utils/logger.ts';

interface DecodeTokenOptions {
  idToken?: boolean;
  logLevel?: string;
  verbose?: boolean;
}

/**
 * Decode and display JWT token claims
 */
function decodeAndDisplayToken(token: string, tokenType: string, logger: Logger): void {
  logger.info(`Decoding ${tokenType}...`);

  const header = decodeJwtHeader(token);
  const payload = decodeJwtPayload(token);

  logger.success(`${tokenType} decoded successfully`);
  logger.info('Header:');
  console.log(JSON.stringify(header, null, 2));
  logger.info('Payload:');
  console.log(JSON.stringify(payload, null, 2));

  // Extract useful information
  if (typeof payload.exp === 'number') {
    const expiryDate = new Date(payload.exp * 1000);
    logger.info(`Token expires: ${expiryDate.toISOString()}`);
    logger.info(`Token is expired: ${Date.now() > payload.exp * 1000}`);
  }

  if (typeof payload.iat === 'number') {
    const issuedDate = new Date(payload.iat * 1000);
    logger.info(`Token issued: ${issuedDate.toISOString()}`);
  }

  if (typeof payload.sub === 'string') {
    logger.info(`Subject (user ID): ${payload.sub}`);
  }

  if (typeof payload.email === 'string') {
    logger.info(`Email: ${payload.email}`);
  }
}

export const decodeTokenCommand = new Command()
  .description('Decode and display JWT token claims')
  .arguments('[token:string]')
  .option('--id-token', 'Decode ID token from credential file instead of access token')
  .action(async (options, token) => {
    const commandOptions = options as unknown as DecodeTokenOptions;
    const logger = createLoggerFromOptions(commandOptions as LoggingOptions);
    try {
      let tokenToDecode: string;
      let tokenType: string;

      if (token) {
        // Token provided as argument
        tokenToDecode = token;
        tokenType = 'provided token';
      } else {
        // Load token from credential file
        const credentials = await loadCredentials();

        if (commandOptions.idToken) {
          if (!credentials.id_token) {
            throw new Error('No ID token found in credential file');
          }
          tokenToDecode = credentials.id_token;
          tokenType = 'ID token from credential file';
        } else {
          if (!credentials.access_token) {
            throw new Error('No access token found in credential file');
          }
          tokenToDecode = credentials.access_token;
          tokenType = 'access token from credential file';
        }
      }

      decodeAndDisplayToken(tokenToDecode, tokenType, logger);
    } catch (error) {
      logger.error(
        'Failed to decode token:',
        error instanceof Error ? error.message : String(error),
      );
      logger.info('Usage:');
      logger.info('- Provide token as argument: decode-token <token>');
      logger.info('- Use credential file: decode-token (decodes access token)');
      logger.info('- Use ID token: decode-token --id-token');
      logger.info('Make sure:');
      logger.info('1. You have logged in first: okta login <username>');
      logger.info('2. The token is a valid JWT');
      Deno.exit(1);
    }
  });
