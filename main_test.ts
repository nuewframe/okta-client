import { assert, assertEquals, assertExists } from '@std/assert';

import denoJson from './deno.json' with { type: 'json' };
import { mainCommand } from './main.ts';
import { loginCommand } from './commands/login/command.ts';
import { serviceCommand } from './commands/service.ts';
import { configCommand } from './commands/config.ts';
import { tokenCommand } from './commands/token/command.ts';

Deno.test('Okta CLI - main module file exists', async () => {
  const filePath = new URL('./main.ts', import.meta.url);
  const stat = await Deno.stat(filePath);
  assert(stat.isFile);
  assert(stat.size > 0);
});

Deno.test('Okta CLI - main command metadata is set', () => {
  assertEquals(mainCommand.getName(), 'okta-client');
  assertEquals(mainCommand.getVersion(), denoJson.version);
  assert(mainCommand.getDescription().length > 0);
});

Deno.test('Okta CLI - top-level commands are registered', () => {
  assertExists(mainCommand.getCommand('login'));
  assertExists(mainCommand.getCommand('service'));
  assertExists(mainCommand.getCommand('token'));
  assertExists(mainCommand.getCommand('config'));
});

Deno.test('Okta CLI - command exports are defined', () => {
  assertExists(loginCommand);
  assertExists(serviceCommand);
  assertExists(configCommand);
  assertExists(tokenCommand);
});

Deno.test('Okta CLI - command descriptions are non-empty', () => {
  const commands = [
    loginCommand,
    serviceCommand,
    configCommand,
    tokenCommand,
  ];

  for (const command of commands) {
    assert(command.getDescription().length > 0);
  }
});

Deno.test('Okta CLI - login command registers expected subcommands', () => {
  assertExists(loginCommand.getCommand('browser'));
  assertExists(loginCommand.getCommand('url'));
  assertExists(loginCommand.getCommand('code'));
  assertExists(loginCommand.getCommand('password'));
});

Deno.test('Okta CLI - service command registers token subcommand', () => {
  const cmd = serviceCommand.getCommand('token');
  assertExists(cmd);
  assertEquals(cmd.getName(), 'token');
});

Deno.test('Okta CLI - token command registers expected subcommands', () => {
  assertExists(tokenCommand.getCommand('info'));
  assertExists(tokenCommand.getCommand('access'));
  assertExists(tokenCommand.getCommand('id'));
  assertExists(tokenCommand.getCommand('refresh'));
  assertExists(tokenCommand.getCommand('claims'));
  assertExists(tokenCommand.getCommand('userinfo'));
});
