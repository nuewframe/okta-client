# deno-cli-dev Skill

## When to Use

Trigger phrases: "deno", "typescript", "CLI development", "deno.json", "jsr publish", "deno compile", "vendor", "import map".

Use this skill when creating, configuring, or improving a Deno CLI project.

---

## Deno Project Structure

```
deno.json               — Deno workspace config (imports map, tasks, compiler options)
main.ts                 — CLI entry point
main_test.ts            — Smoke test for command registration
commands/               — One TypeScript file per CLI subcommand
config/                 — Config loading/saving utilities
services/               — Business logic (pure functions, no CLI dependencies)
utils/                  — Shared utilities (logger, file I/O helpers)
scripts/                — Dev scripts (release.ts, etc.)
vendor/                 — Vendored dependencies (do not edit manually)
dist/                   — Compiled binaries (add to .gitignore)
```

---

## deno.json Reference

```json
{
  "name": "@nuewframe/my-tool",
  "version": "1.0.0",
  "exports": "./main.ts",
  "tasks": {
    "dev": "deno run --allow-env --allow-net --allow-read --allow-write main.ts",
    "test": "deno test --allow-env --allow-read --allow-write --allow-net .",
    "lint": "deno lint",
    "fmt": "deno fmt",
    "check": "deno check main.ts",
    "build:linux": "deno compile --target x86_64-unknown-linux-gnu --allow-env --allow-net --allow-read --allow-write -o dist/my-tool-linux main.ts",
    "build:mac": "deno compile --target x86_64-apple-darwin --allow-env --allow-net --allow-read --allow-write -o dist/my-tool-mac-x64 main.ts",
    "build:mac-arm": "deno compile --target aarch64-apple-darwin --allow-env --allow-net --allow-read --allow-write -o dist/my-tool-mac-arm main.ts",
    "build:win": "deno compile --target x86_64-pc-windows-msvc --allow-env --allow-net --allow-read --allow-write -o dist/my-tool-windows.exe main.ts",
    "build:all": "deno task build:linux && deno task build:mac && deno task build:mac-arm && deno task build:win"
  },
  "imports": {
    "@cliffy/command": "jsr:@cliffy/command@^1.0.0",
    "@std/assert": "jsr:@std/assert@^1.0.0",
    "@std/yaml": "jsr:@std/yaml@^1.0.12",
    "@std/path": "jsr:@std/path@^1.0.0",
    "@std/fs": "jsr:@std/fs@^1.0.0"
  },
  "fmt": {
    "indentWidth": 2,
    "singleQuote": true,
    "semiColons": true,
    "lineWidth": 100
  },
  "lint": {
    "rules": { "tags": ["recommended"] }
  },
  "compilerOptions": {
    "strict": true,
    "lib": ["ES2022", "DOM", "deno.ns"]
  }
}
```

---

## TypeScript Conventions

### Engineering Workflow

Plan before code: express behavior through tests and define the command/service contract before implementation.
Use the command layer for integration/composition only, leaving business logic in pure service and utility functions.
Once tests are green, execute the planned refactor and rerun tests and quality checks. Code is done when it is correct, clean, and verified.

### Strict Mode

Always enable `strict: true`. This catches null-safety issues, implicit `any`, and unused variables at compile time.

### Error types

Always guard unknown error types:

```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ Failed: ${message}`);
}
```

### Async I/O

Use `async/await` with Deno's built-in APIs:

```typescript
// Read
const text = await Deno.readTextFile(path);

// Write (atomic-ish: write then rename for safety)
await Deno.writeTextFile(path, content);

// Check existence
try {
  await Deno.stat(path);
  // exists
} catch {
  // does not exist
}
```

### Path Handling

```typescript
import { dirname, fromFileUrl, join, resolve } from '@std/path';

// User-provided relative paths → resolve from cwd
const resolved = resolve(Deno.cwd(), userProvidedRelativePath);

// Home directory files
const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE') ?? '.';
const configPath = join(home, '.my-tool', 'config.json');
```

---

## Cliffy CLI Framework

### Command Registration Pattern

```typescript
// main.ts
import { Command } from '@cliffy/command';
import { myCommand } from './commands/my-command.ts';

export const mainCommand = new Command()
  .name('my-tool')
  .version('1.0.0')
  .description('Tool description')
  .command('my-command', myCommand);

if (import.meta.main) {
  await mainCommand.parse(Deno.args);
}
```

### Always Export the Root Command

Export `mainCommand` so it can be imported in `main_test.ts`:

```typescript
export const mainCommand = new Command()...;
```

### Option Type System

```typescript
.option('-e, --env <env:string>', 'Environment')     // string
.option('-p, --port <port:number>', 'Port')          // number
.option('-v, --verbose', 'Verbose mode')             // boolean
.option('-t, --tags <tags:string[]>', 'Tag list')    // array
```

---

## Dependency Management

### Adding a new JSR package

1. Add to `deno.json` imports map:
   ```json
   "@std/encoding": "jsr:@std/encoding@^1.0.0"
   ```

2. Import bare in source:
   ```typescript
   import { encodeBase64 } from '@std/encoding';
   ```

3. Vendor it:
   ```bash
   deno cache --vendor main.ts
   ```

### Vendored Dependencies

- `vendor/` directory is committed to source control
- Never edit files in `vendor/` manually
- Re-run `deno cache --vendor main.ts` after any import change

---

## Cross-Compilation

Build platform-specific binaries from any host:

```bash
# All four targets in one command:
deno task build:all

# Resulting files:
dist/my-tool-linux
dist/my-tool-mac-x64
dist/my-tool-mac-arm
dist/my-tool-windows.exe
```

The `--allow-*` flags in the build command become the binary's baked-in permissions — users won't be prompted.

---

## JSR Publishing

To publish on the JSR registry:

1. Set `name` and `version` in `deno.json`
2. Set `exports` to the entry point
3. Run dry run: `deno publish --dry-run`
4. Publish: `deno publish`

Ensure `version` in `deno.json` is bumped before publishing.

---

## Debugging Tips

```bash
# Check for type errors
deno check main.ts

# Run with all permissions for debugging
deno run --allow-all main.ts <args>

# Print import resolution
deno info main.ts

# Show vendored tree
deno info --json main.ts | jq '.modules[] | .specifier'
```

---

## Common Patterns

### Config Directory Init

```typescript
const configDir = join(Deno.env.get('HOME') ?? '.', '.my-tool');
try {
  await Deno.mkdir(configDir, { recursive: true });
} catch (e) {
  if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
}
```

### Spawn a subprocess (requires --allow-run)

```typescript
const command = new Deno.Command('echo', { args: ['hello'], stdout: 'piped' });
const { stdout } = await command.output();
const result = new TextDecoder().decode(stdout).trim();
```

### File exists check

```typescript
async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
```
