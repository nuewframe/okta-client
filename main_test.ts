import { assert, assertEquals, assertExists } from '@std/assert';

import denoJson from './deno.json' with { type: 'json' };
import { mainCommand } from './main.ts';
import { authCommand } from './commands/auth.ts';
import { loginCommand } from './commands/login.ts';
import { clientCredentialsCommand } from './commands/client-credentials.ts';
import { userInfoCommand } from './commands/user-info.ts';
import { decodeTokenCommand } from './commands/decode-token.ts';
import { configCommand } from './commands/config.ts';
import { getCommand } from './commands/get.ts';

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
  assertExists(mainCommand.getCommand('auth-url'));
  assertExists(mainCommand.getCommand('login'));
  assertExists(mainCommand.getCommand('client-credentials'));
  assertExists(mainCommand.getCommand('user-info'));
  assertExists(mainCommand.getCommand('decode'));
  assertExists(mainCommand.getCommand('config'));
  assertExists(mainCommand.getCommand('get'));
});

Deno.test('Okta CLI - command exports are defined', () => {
  assertExists(authCommand);
  assertExists(loginCommand);
  assertExists(clientCredentialsCommand);
  assertExists(userInfoCommand);
  assertExists(decodeTokenCommand);
  assertExists(configCommand);
  assertExists(getCommand);
});

Deno.test('Okta CLI - command descriptions are non-empty', () => {
  const commands = [
    authCommand,
    loginCommand,
    clientCredentialsCommand,
    userInfoCommand,
    decodeTokenCommand,
    configCommand,
    getCommand,
  ];

  for (const command of commands) {
    assert(command.getDescription().length > 0);
  }
});

Deno.test('Okta CLI - get command registers access-token subcommand', () => {
  const accessTokenCommand = getCommand.getCommand('access-token');
  assertExists(accessTokenCommand);
  assertEquals(accessTokenCommand.getName(), 'access-token');
  assert(accessTokenCommand.getDescription().length > 0);
});
