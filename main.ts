#!/usr/bin/env -S deno run --allow-env --allow-net

import { Command } from '@cliffy/command';
import denoJson from './deno.json' with { type: 'json' };
import { loginCommand } from './commands/login/command.ts';
import { serviceCommand } from './commands/service.ts';
import { configCommand } from './commands/config.ts';
import { tokenCommand } from './commands/token/command.ts';

function applyGlobalConfigPathOverride(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--env-file') {
      const value = args[i + 1];
      if (value) {
        Deno.env.set('NUEWFRAME_CONFIG', value);
      }
      return;
    }

    if (arg.startsWith('--env-file=')) {
      const value = arg.slice('--env-file='.length);
      if (value) {
        Deno.env.set('NUEWFRAME_CONFIG', value);
      }
      return;
    }
  }
}

const mainCommand = new Command()
  .name('nfauth')
  .version(denoJson.version)
  .description(
    '🔐 Nuewframe OAuth CLI for browser login, headless flows, and service token management',
  )
  .meta('deno', Deno.version.deno)
  .example('login-browser', 'nfauth login browser --env dev')
  .example('headless-login', 'nfauth login url && nfauth login code <code>')
  .example('service-token', 'nfauth service token --scope api.read')
  .example('config-init', 'nfauth config init')
  .globalOption('-e, --env <env:string>', 'Environment to use (defaults to current config)')
  .globalOption(
    '-p, --profile <profile:string>',
    'Profile to use (overrides current config profile)',
  )
  .globalOption('-v, --verbose', 'Enable verbose output')
  .globalOption('--log-level <level:string>', 'Log level (none, info, debug)', { default: 'info' })
  .globalOption(
    '--env-file <path:string>',
    'Path to config YAML file (overrides ~/.nuewframe/nfauth/config.yaml)',
  )
  .command('login', loginCommand)
  .command('service', serviceCommand)
  .command('token', tokenCommand)
  .command('config', configCommand);

// Export for testing
export { mainCommand };

if (import.meta.main) {
  try {
    applyGlobalConfigPathOverride(Deno.args);
    await mainCommand.parse(Deno.args);
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}
