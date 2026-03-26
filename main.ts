#!/usr/bin/env -S deno run --allow-env --allow-net

import { Command } from '@cliffy/command';
import denoJson from './deno.json' with { type: 'json' };
import { authCommand } from './commands/auth.ts';
import { loginCommand } from './commands/login.ts';
import { loginBrowserCommand } from './commands/login-browser.ts';
import { clientCredentialsCommand } from './commands/client-credentials.ts';
import { userInfoCommand } from './commands/user-info.ts';
import { decodeTokenCommand } from './commands/decode-token.ts';
import { configCommand } from './commands/config.ts';
import { getCommand } from './commands/get.ts';

const mainCommand = new Command()
  .name('okta-client')
  .version(denoJson.version)
  .description(
    '🔐 Okta Service CLI - A powerful command-line tool for Okta authentication and user management',
  )
  .meta('deno', Deno.version.deno)
  .example('auth-url', 'okta-client auth-url --env dev')
  .example('user-info', 'okta-client user-info <access-token>')
  .example('config-init', 'okta-client config init')
  .globalOption('-e, --env <env:string>', 'Environment to use (defaults to current config)')
  .globalOption(
    '-n, --namespace <namespace:string>',
    'Namespace to use (defaults to current config)',
  )
  .globalOption('-v, --verbose', 'Enable verbose output')
  .globalOption('--log-level <level:string>', 'Log level (none, info, debug)', { default: 'info' })
  .globalOption('--config <config:string>', 'Path to config file')
  .command('auth-url', authCommand)
  .command('login', loginCommand)
  .command('login-browser', loginBrowserCommand)
  .command('client-credentials', clientCredentialsCommand)
  .command('user-info', userInfoCommand)
  .command('decode', decodeTokenCommand)
  .command('config', configCommand)
  .command('get', getCommand);

// Export for testing
export { mainCommand };

if (import.meta.main) {
  try {
    await mainCommand.parse(Deno.args);
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}
