# new-command Skill

## When to Use

Trigger phrases: "add command", "new command", "create command", "new subcommand".

Use this skill when adding a new CLI subcommand to `okta-client`.

---

## Checklist

1. [ ] Create `commands/<verb-or-verb-noun>.ts`
2. [ ] Export the command as a named `const`
3. [ ] Register it in `main.ts`
4. [ ] Add a smoke test in `main_test.ts`
5. [ ] Add command reference to `README.md`

---

## Step 1 — Create the Command File

File: `commands/<name>.ts`

```typescript
import { Command } from '@cliffy/command';
import { Logger, LogLevel } from '../utils/logger.ts';
import { getEnvironmentConfig, loadConfig } from '../config/app.config.ts';
import { loadCredentials } from '../utils/credentials.ts';

export const myCommand = new Command()
  .name('my-command')
  .description('Short description of what this command does')
  .option('-e, --env <env:string>', 'Environment name (overrides config default)')
  .option('-n, --namespace <ns:string>', 'Namespace (overrides config default)')
  .option('--verbose', 'Enable verbose output')
  .arguments('[optionalArg:string]')
  .action(async (options, optionalArg) => {
    const logger = new Logger(options.verbose ? LogLevel.Debug : LogLevel.None);
    try {
      const config = loadConfig();
      const env = getEnvironmentConfig(
        config,
        options.env ?? config.current?.env,
        options.namespace ?? config.current?.namespace,
      );
      logger.info(`Using environment: ${env.domain}`);

      // --- implementation here ---

      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(
        '❌ my-command failed:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
```

**Naming conventions:**

- File: kebab-case verb or verb-noun (`decode-token.ts`, `user-info.ts`)
- Export: camelCase (`decodeTokenCommand`, `userInfoCommand`)
- Command name: same as file without `.ts`

## Step 2 — Register in main.ts

```typescript
// In main.ts — add import
import { myCommand } from './commands/my-command.ts';

// Add to root command (keep alphabetical)
const mainCommand = new Command()
  .name('okta-client')
  // ... existing commands ...
  .command('my-command', myCommand);
```

## Step 3 — Add Global Option Inheritance

If your command needs `--env`, `--namespace`, `--log-level`, or `--verbose`, declare them directly on the command (not only on the root). These are not auto-inherited in Cliffy.

```typescript
export const myCommand = new Command()
  .option('-e, --env <env:string>', 'Okta environment')
  .option('-n, --namespace <ns:string>', 'Config namespace')
  .option('--verbose', 'Enable verbose output');
// ... rest of command
```

## Step 4 — Smoke Test in main_test.ts

```typescript
Deno.test('my-command subcommand exists', () => {
  const cmd = mainCommand.getCommand('my-command');
  assertExists(cmd);
  assertEquals(cmd.getName(), 'my-command');
  assertExists(cmd.getOption('env')); // if -e is declared
});
```

## Step 5 — Subcommands Pattern

If the command has sub-operations (like `config init`, `config show`):

```typescript
export const myCommand = new Command()
  .description('Parent command description')
  .action((_options) => {
    console.log('Run: okta-client my-command <subcommand>');
  });

myCommand.command('sub-one', 'Do sub-thing one')
  .action(async (_options) => {
    // ...
  });

myCommand.command('sub-two <arg:string>', 'Do sub-thing two with arg')
  .action(async (_options, arg) => {
    // ...
  });
```

## Error Handling Rules

- Catch at the command action level — never let errors propagate to Cliffy
- Use `error instanceof Error ? error.message : String(error)`
- Print `❌ <command-name> failed: <message>` to stderr
- Exit with `Deno.exit(1)` on error
- Provide a helpful follow-up hint when relevant (e.g., `Run: okta-client config init`)

## Credential Security in Commands

- Never accept passwords as flags — use masked stdin (see `commands/login.ts`)
- Abbreviate tokens in log output: `token.substring(0, 6) + '...'`
- Never log full client secrets, access tokens, or API tokens

## Output Conventions

| Type            | Pattern                                      |
| --------------- | -------------------------------------------- |
| Structured data | `console.log(JSON.stringify(data, null, 2))` |
| Property list   | `console.log(\`Key: ${value}\`)`             |
| Success message | `logger.success('Done')`                     |
| Info/progress   | `logger.info('message')`                     |
| Debug detail    | `logger.debug('detail')`                     |
| Error + exit    | `console.error('❌ ...'); Deno.exit(1)`      |
