import { Command } from '@cliffy/command';
import { OktaLoginService } from '../services/okta-login.service.ts';
import type { OktaLoginConfig } from '../services/okta-login.service.ts';
import { getCurrentOktaConfig, loadConfig, resolveConfigSelection } from '../config/app.config.ts';
import { saveCredentials } from '../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';

interface LoginCommandOptions {
  env?: string;
  namespace?: string;
  logLevel?: string;
  verbose?: boolean;
}

/**
 * Securely prompt for password input with masking
 */
async function promptPassword(prompt: string): Promise<string> {
  console.log(prompt);

  // Set stdin to raw mode to read character by character
  const originalRaw = Deno.stdin.isTerminal() ? Deno.stdin.setRaw(true) : false;

  let password = '';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const buf = new Uint8Array(1);
      const n = await Deno.stdin.read(buf);
      if (n === null) break;

      const char = decoder.decode(buf.subarray(0, n));

      // Handle Enter key (newline)
      if (char === '\n' || char === '\r') {
        console.log(''); // Move to next line
        break;
      }

      // Handle backspace
      if (char === '\x7f' || char === '\x08') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          // Move cursor back, overwrite with space, move back again
          await Deno.stdout.write(encoder.encode('\x08 \x08'));
        }
        continue;
      }

      // Handle Ctrl+C
      if (char === '\x03') {
        console.log('\nOperation cancelled');
        Deno.exit(1);
      }

      // Handle Ctrl+D
      if (char === '\x04') {
        break;
      }

      // Add character to password and show asterisk
      password += char;
      await Deno.stdout.write(encoder.encode('*'));
    }

    if (!password) {
      throw new Error('Password is required');
    }

    return password;
  } finally {
    // Restore original stdin mode
    if (originalRaw) {
      Deno.stdin.setRaw(false);
    }
  }
}

export const loginCommand = new Command()
  .description('Direct login with username/password')
  .arguments('<username:string>')
  .action(async (options, username) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginCommandOptions;
      const config = loadConfig();
      const selection = resolveConfigSelection(
        config,
        commandOptions.env,
        commandOptions.namespace,
      );
      const oktaConfig = getCurrentOktaConfig(config, selection.env, selection.namespace);
      if (!oktaConfig.redirectUri) {
        throw new Error(
          'Missing redirectUri in selected Okta configuration. Set redirectUri in config.yaml for this env/namespace.',
        );
      }

      const authorizationServerId = oktaConfig.authorizationServerId || 'default';

      const loginConfig: OktaLoginConfig = {
        issuer: `${oktaConfig.domain}/oauth2/${authorizationServerId}`,
        clientId: oktaConfig.clientId,
        redirectUri: oktaConfig.redirectUri,
        scope: oktaConfig.scope || 'openid profile email',
      };

      const loginService = new OktaLoginService(loginConfig);

      logger.info('Attempting login...');
      logger.info(`Environment: ${selection.env}`);
      logger.info(`Namespace: ${selection.namespace}`);
      logger.info(`Domain: ${oktaConfig.domain}`);

      // Prompt for password securely
      const password = await promptPassword('Enter password: ');

      const tokens = await loginService.login({ username, password });

      logger.success('Login successful');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`ID Token: ${tokens.id_token.substring(0, 50)}...`);
      logger.info(`Token Type: ${tokens.token_type}`);
      logger.info(`Expires In: ${tokens.expires_in} seconds`);
      logger.info(`Scope: ${tokens.scope}`);
      if (tokens.refresh_token) {
        logger.info('Refresh Token: Available');
      }

      // Save tokens to credential file
      await saveCredentials(tokens);

      logger.success('Tokens saved to ~/.nuewframe/credential.json');
    } catch (error) {
      logger.error('Login failed:', error instanceof Error ? error.message : String(error));
      logger.info('Make sure your configuration is set up: deno task cli okta config-init');
      Deno.exit(1);
    }
  });
