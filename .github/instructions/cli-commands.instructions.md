---
description: 'Use when adding, modifying, or reviewing CLI commands in Nuewframe OAuth CLI. Covers Cliffy command structure, option/argument patterns, subcommand registration, global option inheritance, and output formatting.'
applyTo: 'commands/*.ts'
---

# CLI Command Conventions (Cliffy)

## Command File Structure

Each command lives in its own file under `commands/` and exports a single `Command` instance:

```typescript
import { Command } from '@cliffy/command';
import { loadConfig } from '../config/app.config.ts';

export const myCommand = new Command()
  .name('my-command')
  .description('Do something useful')
  .option('-f, --flag <value:string>', 'Description of flag', { default: 'default-value' })
  .arguments('<required:string> [optional:string]')
  .action(async (options, required, optional) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      // implementation
    } catch (error) {
      logger.error('my-command failed:', error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  });
```

## Architecture and workflow

Commands are the composition layer: they wire services, utilities, and shared types into the CLI experience.
Keep business logic in `services/` or `utils/`, and let commands focus on option parsing, environment selection, output formatting, and error handling.

Plan before code: define the command contract and smoke tests first, then implement the minimal integration logic.
After the first green tests, execute any planned refactor and rerun tests to verify the command remains clean and correct.

## Registration in main.ts

Add the command to the root `Command` in `main.ts` (keep alphabetical order):

```typescript
import { myCommand } from './commands/my-command.ts';

const mainCommand = new Command()
  .name('nfauth')
  // ... global options
  .command('my-command', myCommand);
```

## Global Options Pattern

The main command exposes `--env`, `--profile`, `--log-level`, `--verbose`, and `--env-file`.
Commands access them via `options` destructuring in the action handler:

```typescript
.action(async (options) => {
  const commandOptions = options as unknown as { env?: string; profile?: string; logLevel?: string };
  const logger = createLoggerFromOptions(commandOptions as LoggingOptions);
  const config = loadConfig();
  const selection = resolveConfigSelection(config, commandOptions.env, commandOptions.profile);
  ...
})
```

## Commands in this repo

| Command                         | File                    | Description                                                     |
| ------------------------------- | ----------------------- | --------------------------------------------------------------- |
| `auth-url`                      | `auth.ts`               | Generate PKCE authorization URL                                 |
| `auth-url exchange-code <code>` | `auth.ts` (subcommand)  | Exchange code for tokens                                        |
| `login <username>`              | `login.ts`              | Direct username/password login                                  |
| `login-browser`                 | `login-browser.ts`      | Browser-based PKCE login                                        |
| `client-credentials`            | `client-credentials.ts` | Machine-to-machine token                                        |
| `user-info [token]`             | `user-info.ts`          | Fetch user profile                                              |
| `decode [token]`                | `decode-token.ts`       | Decode JWT claims                                               |
| `config`                        | `config.ts`             | Manage config (subcommands: init, show, add, set-default, list) |
| `get access-token`              | `get.ts`                | Print raw access token                                          |

## Subcommands

Nest subcommands using `.command()` on the parent:

```typescript
export const configCommand = new Command()
  .description('Manage configuration')
  .action((options) => { /* show usage hint */ });

configCommand.command('init', 'Initialize configuration directory')
  .action((options) => { ... });

configCommand.command('show', 'Show current configuration')
  .action((options) => { ... });
```

## Option Type Annotations

Cliffy infers types from angle bracket syntax:

```typescript
.option('-e, --env <env:string>', 'Environment name')
.option('-p, --port <port:number>', 'Port number')
.option('-v, --verbose', 'Enable verbose output')   // boolean flag
.option('--scope <scope:string>', 'Scope', { default: 'openid profile email' })
```

## Output Conventions

| Scenario        | Code                                         |
| --------------- | -------------------------------------------- |
| Structured data | `console.log(JSON.stringify(data, null, 2))` |
| Success         | `logger.success('Action completed')`         |
| Info            | `logger.info('Detail here')`                 |
| Error + exit    | `logger.error('Failed:', msg); Deno.exit(1)` |

## Security: Masked Password Input

Never accept passwords via CLI flags. Use raw stdin mode from `commands/login.ts`:

```typescript
await Deno.stdout.write(new TextEncoder().encode('Password: '));
Deno.stdin.setRaw(true);
// Read chars one by one, echo '*' instead of the actual character
```

## Credential Abbreviation in Logs

When logging token values for debug output, always abbreviate:

```typescript
logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
logger.debug(`Bearer ${token.substring(0, 6)}...`);
```

## Error Handling Template

```typescript
.action(async (options) => {
  const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
  try {
    // ... implementation
  } catch (error) {
    logger.error('<command-name> failed:', error instanceof Error ? error.message : String(error));
    logger.info('Make sure your configuration is set up: nfauth config init');
    Deno.exit(1);
  }
});
```
