---
description: 'Use when writing, editing, or reviewing TypeScript source files in the Nuewframe OAuth CLI Deno workspace. Covers import patterns, type conventions, permission declarations, config file formats, and error handling.'
applyTo: '**/*.ts'
---

# TypeScript / Deno Conventions

## Architecture Paradigm

All code follows a strict layering order: **Capability → Data Structure → Function → Composition → Integration**.

1. **Capability** — Define _what_ the system can do via TypeScript types and interfaces. Types are declared before any implementation and are the source of truth.
2. **Data Structure** — Concrete types that flow through the system (parsed files, configs, results, errors). Data structures implement capabilities.
3. **Function** — Pure, stateless functions that transform data structures. Each function lives in a focused module under `commands/<domain>/` or `utils/`.
4. **Composition** — CLI commands compose functions into workflows. A command never contains business logic directly — it wires capability, data, and functions together and exposes them to the user.
5. **Integration** — Contracts that connect layers: shared types imported across modules, the `ParsedGqlFile → GqlContent[]` pipeline, stdout/stderr output contract, and the `~/.nuewframe/` file-system contract with `nfauth`.

When adding new code, work top-down through these layers. Define the types first, implement the functions that operate on them, then compose everything in the command handler.

## Plan Before Code

Always have a plan before writing code. The plan is manifested in test cases when practicing TDD and ensures e2e and unit tests are thought about and planned prior to implementation.

A good plan forces thinking about the layers above from a composition and integration perspective before code is written.

Plan content should include planned refactor targets, dependency boundaries, and the tests that prove the new behavior.

## Engineering Pillars

Apply these pillars consistently when writing or reviewing code:

- **Domain pillar** — preserve ubiquitous language, keep bounded contexts isolated, favor aggregate ownership, use value objects for domain concepts, isolate repositories, and emit domain events when behavior crosses boundaries.
- **Design pillar** — evaluate SRP, OCP, LSP, ISP, and DIP when refactoring or extending code.
- **Elimination pillar** — remove duplication, collapse over-abstractions, remove unused helpers/utilities, and avoid speculative abstractions.
- **Clarity pillar** — favor intent-revealing naming, strict layer boundaries, minimal public contracts, and dependency injection over concrete coupling.

## Execute Planned Refactor

When tests are green, perform the planned refactor and then rerun tests and quality checks. Code is not done when it is only correct; it is done when it is clean and verified.

## Deno Version Target

Minimum Deno 2.0. Use the native Deno APIs and JSR packages.

## TypeScript Settings

From `deno.json`:

- `strict: true`
- `lib: ["ES2022", "DOM", "deno.ns"]`
- `2-space indent, single quotes, semicolons, 100-char line width`

Never use `// @ts-ignore` or `// @ts-nocheck` without a comment explaining why.

## Import Rules

### Correct patterns

```typescript
// JSR packages — bare (declared in deno.json "imports" map)
import { Command } from '@cliffy/command';
import { parse as parseYaml, stringify as stringifyYaml } from '@std/yaml';
import { assert, assertEquals } from '@std/assert';
import { OktaAuth } from '@okta/okta-auth-js';

// Internal — relative path with .ts extension
import { loadConfig } from '../config/app.config.ts';
import { Logger } from '../utils/logger.ts';
import { loadCredentials } from '../utils/credentials.ts';
```

### Forbidden patterns

```typescript
// ❌ Never import via https://
import { parse } from 'https://deno.land/std/yaml/mod.ts';

// ❌ Never use jsr: or npm: directly in source files
import { Command } from 'jsr:@cliffy/command';
import { OktaAuth } from 'npm:@okta/okta-auth-js';

// ❌ Never use extensionless internal paths
import { loadConfig } from '../config/app.config';
```

### Updating imports map

When adding new packages, update `deno.json` **and** vendor the cache:

```bash
deno cache --vendor main.ts
```

## File Naming Conventions

| Type          | Pattern              | Example                               |
| ------------- | -------------------- | ------------------------------------- |
| Command       | kebab-case verb      | `login-browser.ts`                    |
| Service       | `<name>.service.ts`  | `okta.service.ts`                     |
| Config module | descriptive          | `app.config.ts`                       |
| Utility       | descriptive noun     | `credentials.ts`, `jwt.ts`, `pkce.ts` |
| Test          | `<original>_test.ts` | `app.config_test.ts`                  |

## Config File — `~/.nuewframe/nfauth/config.yaml`

Loaded and saved by `config/app.config.ts`. Schema:

```yaml
security:
  auth:
    dev:
      default:
        domain: https://your-oauth-domain.example.com
        clientId: your-client-id
        auth:
          type: OAuth2
          clientSecret: your-client-secret
        redirectUri: http://localhost:7879/callback
        scope: openid profile email
current:
  env: dev
  profile: default
```

Load with:

```typescript
import { getEnvironmentConfig, loadConfig } from '../config/app.config.ts';
const config = loadConfig(); // throws if file missing/invalid
const env = getEnvironmentConfig(config, 'dev', 'default'); // throws if env missing
```

## Credential File — `~/.nuewframe/credential.json`

Written by `nfauth login`; read by `gql-client`. Schema:

```json
{
  "access_token": "...",
  "id_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "refresh_token": "...",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

Load with:

```typescript
import { loadCredentials, saveCredentials } from '../utils/credentials.ts';
const creds = await loadCredentials(); // returns null if file missing
```

## Permissions Model

Request only what is actually needed:

```
--allow-env      # for home directory (~) and env var reads
--allow-net      # for HTTP/HTTPS calls to Okta
--allow-read     # for config and credential file reads
--allow-write    # for writing credential/config files
--allow-run      # only for browser-open OS commands in login-browser
```

Define in `deno.json` tasks — do NOT override in source code.

## Error Handling

**At command boundary:**

```typescript
try {
  // all implementation here
} catch (error) {
  console.error('❌ login failed:', error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
```

**In services and utilities** — throw typed errors, never log:

```typescript
// In a service function:
if (!response.ok) {
  const body = await response.text();
  throw new Error(`Okta API error ${response.status}: ${body}`);
}
```

Do NOT use `throw` across CLI command boundaries — always catch at the command level.

## Logger Usage

```typescript
import { Logger, LogLevel } from '../utils/logger.ts';

// Create from options (commands)
const logger = new Logger(options.verbose ? LogLevel.Debug : options.logLevel ?? LogLevel.None);

// Usage
logger.info('Starting login flow');
logger.debug('Token:', token.substring(0, 6) + '...');
logger.error('Failed to connect'); // stderr
logger.success('Login successful');
```

Logger in this package writes to **stdout** (unlike gql-client which uses stderr).

## Credential Security Rules

1. **Never** log a full access token or client secret
2. **Never** accept passwords as CLI flags — use masked stdin input
3. Abbreviate tokens in logs: `token.substring(0, 6) + '...'`
4. Read credentials from files (not from `Deno.env`) unless the user explicitly sets env vars

## Type Guards

Use the error type guard consistently:

```typescript
const message = error instanceof Error ? error.message : String(error);
```

## Async File I/O

Use `Deno.readTextFile` / `Deno.writeTextFile` (async), not the sync variants:

```typescript
const content = await Deno.readTextFile(configPath);
await Deno.writeTextFile(credentialPath, JSON.stringify(data, null, 2));
```

## Home Directory Resolution

```typescript
const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE') ?? '.';
const configDir = resolve(home, '.nuewframe');
```
