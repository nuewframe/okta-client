---
description: 'Use when writing, running, or reviewing tests in Nuewframe OAuth CLI. Covers Deno.test patterns, @std/assert assertions, test file naming, how to mock Deno.env, and test organization.'
applyTo: '**/*_test.ts'
---

# Testing Conventions

## Test File Naming

Tests are named after the module under test with `_test.ts` suffix (underscore, not dot):

| Source file                      | Test file                             |
| -------------------------------- | ------------------------------------- |
| `config/app.config.ts`           | `config/app.config_test.ts`           |
| `services/okta.service.ts`       | `services/okta.service_test.ts`       |
| `services/okta-login.service.ts` | `services/okta-login.service_test.ts` |
| `main.ts`                        | `main_test.ts`                        |

## Plan Before Code

Use tests as the plan. Before writing implementation, define the expected behavior with unit or smoke tests that capture the command/service contract, integration points, and edge cases.

A planned test surface should include both happy-path and failure-path coverage, and should help preserve layer separation between commands, services, and utilities.

## Execute Planned Refactor

When the initial tests are green, perform the planned refactor, then rerun tests and quality checks. Code is not done when it is only correct; it is done when it is clean and verified.

## Deno.test Format

Use the object-style registration (not callback-only):

```typescript
import { assertEquals, assertExists, assertRejects } from '@std/assert';

Deno.test('descriptive test name', async () => {
  // arrange
  const input = 'test-value';

  // act
  const result = functionUnderTest(input);

  // assert
  assertEquals(result, 'expected-value');
});
```

For grouped tests, use the `t.step()` pattern:

```typescript
Deno.test('OktaService', async (t) => {
  await t.step('buildAuthorizeUrl includes scope parameter', () => {
    const url = buildAuthorizeUrl({ scope: 'openid' });
    assert(url.includes('scope=openid'));
  });

  await t.step('throws on missing domain', async () => {
    await assertRejects(
      () => service.getTokens(config),
      Error,
      'Domain is required',
    );
  });
});
```

## Assertions

Use `@std/assert` — never use `console.assert` or raw `throw`:

```typescript
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from '@std/assert';
```

| Goal               | Assertion                                            |
| ------------------ | ---------------------------------------------------- |
| Truthy             | `assert(value)`                                      |
| Strict equality    | `assertEquals(actual, expected)`                     |
| Not null/undefined | `assertExists(value)`                                |
| String contains    | `assertStringIncludes(str, 'substring')`             |
| Async throws       | `await assertRejects(() => fn(), ErrorClass, 'msg')` |
| Sync throws        | `assertThrows(() => fn(), ErrorClass, 'msg')`        |
| Not equal          | `assertNotEquals(a, b)`                              |

## Test Structure for Commands (Smoke Tests)

For CLI command registration tests (in `main_test.ts`), follow this pattern:

```typescript
import { assertEquals, assertExists } from '@std/assert';
import { mainCommand } from './main.ts';

Deno.test('main command is registered', () => {
  assertEquals(mainCommand.getName(), 'nfauth');
});

Deno.test('login subcommand exists', () => {
  const cmd = mainCommand.getCommand('login');
  assertExists(cmd);
  assertEquals(cmd.getName(), 'login');
});
```

## Mocking Deno.env

Use `Deno.env.set` / `Deno.env.delete` within the test, restoring afterwards:

```typescript
Deno.test('loads config from env', () => {
  const original = Deno.env.get('NUEWFRAME_CONFIG');
  try {
    Deno.env.set('NUEWFRAME_CONFIG', '/tmp/test-config.yaml');
    const result = loadConfig();
    assertExists(result);
  } finally {
    if (original !== undefined) {
      Deno.env.set('NUEWFRAME_CONFIG', original);
    } else {
      Deno.env.delete('NUEWFRAME_CONFIG');
    }
  }
});
```

## Testing Config Loading

Write test YAML/JSON strings directly; don't depend on real home directory files:

```typescript
Deno.test('parseAppConfig handles unified format', () => {
  const yaml = `
security:
  auth:
    dev:
      default:
        domain: https://test.example.com
        clientId: client123
current:
  env: dev
  profile: default
`.trim();

  const config = parseConfig(yaml);
  assertEquals(config.current.env, 'dev');
  assertEquals(config.security.auth.dev.default.domain, 'https://test.example.com');
});
```

## Testing Services

For service unit tests, test the pure logic (URL building, token parsing) without making real HTTP calls:

```typescript
Deno.test('OktaService.buildAuthorizeUrl constructs correct URL', () => {
  const url = OktaService.buildAuthorizeUrl({
    domain: 'https://dev.okta.com',
    clientId: 'abc',
    redirectUri: 'http://localhost:7879/callback',
    scope: 'openid profile',
    codeChallenge: 'challenge123',
    codeChallengeMethod: 'S256',
    state: 'state456',
  });
  assertStringIncludes(url, 'response_type=code');
  assertStringIncludes(url, 'code_challenge=challenge123');
});
```

## Permissions for Tests

Add required permissions to test task in `deno.json`:

```json
{
  "tasks": {
    "test": "deno test --allow-env --allow-read --allow-write tests/ ."
  }
}
```

## Running Tests

```bash
deno task test          # run all tests
deno test specific_test.ts  # run one file
deno test --filter "OktaService"  # filter by name pattern
```

## Test Isolation

- Never depend on test execution order
- Clean up any files written during tests using `try/finally`
- Use unique temp paths to avoid collision: `/tmp/nfauth-test-${Date.now()}.yaml`
- Don't leave `.nuewframe/` config files on disk after tests
