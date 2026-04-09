# Nuewframe OAuth CLI — Project Context

## Purpose

Nuewframe OAuth CLI is a standalone Deno CLI for Okta authentication and token management.
It implements OAuth 2.0 / OIDC flows and writes tokens to `~/.nuewframe/credential.json`
so that other tools (`gql-client`, scripts, CI pipelines) can consume them without
re-authenticating.

## Architecture

Work top-down through the layers: commands are the composition/integration layer, services implement business logic, and utils provide shared support.
Plan new behavior in tests first, then wire the command layer to the service and utility functions.

```
main.ts                    CLI entry point; registers all commands with Cliffy
commands/                  Capability-oriented command modules
  login/
    command.ts             Login command composition entrypoint
    browser.ts             Interactive browser login flow
    url.ts                 Headless/manual login URL generation
    code.ts                Manual code exchange completion
    password.ts            Direct username/password login (masked stdin)
    context.ts             Login config resolution helpers
    flow.ts                Browser and callback flow helpers
    types.ts               Login option/context types
  token/
    command.ts             Token command composition entrypoint
    info.ts                Saved credential summary
    raw-token.ts           Access/ID/refresh raw token retrieval
    claims.ts              JWT claim inspection commands
    claims-utils.ts        JWT and expiry helper functions
    userinfo.ts            OIDC userinfo retrieval
    types.ts               Token option types
  client-credentials.ts    Machine-to-machine client_credentials grant
  service.ts               Service command root
  config.ts                Manage ~/.nuewframe/nfauth/config.yaml (init/show/add/set-default/list)
config/
  app.config.ts            Load/save ~/.nuewframe/nfauth/config.yaml, type definitions
services/
  okta.service.ts          Core OAuth/OIDC HTTP calls (pure fetch, no SDK)
  okta-login.service.ts    Direct login via @okta/okta-auth-js (IDX API)
utils/
  credentials.ts           Load/save ~/.nuewframe/credential.json
  jwt.ts                   Pure-JS JWT header/payload decoder (no verification)
  logger.ts                Logger class (none/info/debug levels) → stdout
  pkce.ts                  RFC 7636 PKCE (verifier, S256 challenge, state helpers)
  cdp.ts                   Chrome DevTools Protocol automation for browser login
  okta-service-options.ts  Build OktaConfig from OktaEnvironment
```

## Integration Contract

This tool **writes** `~/.nuewframe/credential.json`. Any tool that needs an Okta token
reads the `access_token` field from this file.

Credential schema:

```json
{
  "access_token": "eyJ...",
  "id_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "refresh_token": "...",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

Credential location: `~/.nuewframe/credential.json`

## Config File

Location: `~/.nuewframe/nfauth/config.yaml`

```yaml
security:
  env: dev
  profile: default
  auth:
    dev:
      default:
        type: oauth2
        provider:
          issuer_uri: https://your-oauth-domain.example.com/oauth2/default
          discovery_url: /.well-known/openid-configuration
        client:
          client_id: your-client-id
          client_secret: your-client-secret
          client_authentication_method: basic
          grant_type: authorization_code
          redirect_uri: http://localhost:7879/callback
          scope: openid profile email
```

- `security.env` selects the active top-level key under `security.auth`
- `security.profile` selects the active key under `security.auth.<env>`
- Commands accept `--env` and `--profile` to override active selection
- `provider.discovery_url` is optional; when omitted, the CLI derives `/.well-known/openid-configuration` from `issuer_uri`

## Key Files

| File                             | Role                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `deno.json`                      | Package manifest version, imports map, and task definitions                                     |
| `main.ts`                        | Export `mainCommand`; entry point when `import.meta.main`                                       |
| `config/app.config.ts`           | `loadConfig()`, `parseConfig()`, `getEnvironmentConfig()`                                       |
| `utils/credentials.ts`           | `loadCredentials()`, `saveCredentials()`                                                        |
| `utils/pkce.ts`                  | `generateCodeVerifier()`, `generateCodeChallenge()`                                             |
| `services/okta.service.ts`       | `getAuthorizeUrl()`, `exchangeCodeForTokens()`, `getClientCredentialsTokens()`, `getUserInfo()` |
| `services/okta-login.service.ts` | `loginWithCredentials()` using @okta/okta-auth-js                                               |

## Command Surface Summary

```
nfauth login browser                     Browser PKCE flow (interactive)
nfauth login url                         Generate headless/manual login URL + PKCE state
nfauth login code CODE                   Complete login by exchanging code
nfauth login password USERNAME           Direct login with password prompt
nfauth service token                     Machine-to-machine token
nfauth token info                        Show saved token summary
nfauth token access                      Print saved access token
nfauth token id                          Print saved ID token
nfauth token refresh                     Print saved refresh token
nfauth token claims access               Decode saved access token claims
nfauth token claims id                   Decode saved ID token claims
nfauth token userinfo                    Fetch user profile from /userinfo endpoint
nfauth config init                       Initialize config directory
nfauth config show                       Show current config
nfauth config add                        Add an environment interactively
nfauth config set-default --env ENV --profile PROFILE
nfauth config list                       List all environments
```

## Technology Stack

| Concern            | Library                              |
| ------------------ | ------------------------------------ |
| CLI framework      | `@cliffy/command@^1.0.0`             |
| YAML (config)      | `@std/yaml@^1.0.12`                  |
| Assertions (tests) | `@std/assert@^1.0.19`                |
| Okta IDX login     | `@okta/okta-auth-js@^8.0.0`          |
| Runtime            | Deno 2.0+, TypeScript 5, strict mode |

## Permissions

| Permission      | Reason                                                  |
| --------------- | ------------------------------------------------------- |
| `--allow-env`   | Home directory (`HOME`/`USERPROFILE`) and env var reads |
| `--allow-net`   | HTTP/HTTPS calls to Okta endpoints                      |
| `--allow-read`  | Read config and credential files                        |
| `--allow-write` | Write credential and config files                       |
| `--allow-run`   | Browser open OS command (login-browser only)            |

## Test Coverage

Tests live alongside the source (same directory as source files):

| File                                  | Tests | Covers                                      |
| ------------------------------------- | ----- | ------------------------------------------- |
| `main_test.ts`                        | 6     | Command registration smoke tests            |
| `config/app.config_test.ts`           | 7     | Config loading, validation, env var parsing |
| `services/okta.service_test.ts`       | 6     | URL building, token exchange logic          |
| `services/okta-login.service_test.ts` | 8     | Direct login flow, error cases              |

Run: `deno task test`\
Total: 27 tests, all passing.

## Security Invariants

1. Passwords are **never** accepted as CLI flags — masked stdin only
2. Tokens in logs are always abbreviated: `token.substring(0, 6) + '...'`
3. API tokens and client secrets are never logged at any level
4. Credentials are read/written via file I/O, not env vars
5. Service calls use PKCE (`S256`) or client_credentials — no implicit flow

## Modernization Audit (Deno 2 / TypeScript 5)

**Last audited:** 2025-07-25 | **Runtime:** Deno 2.7.x | **TypeScript:** 5.9.x

### Dependency Status

| Package              | Version   | Status                                |
| -------------------- | --------- | ------------------------------------- |
| `@cliffy/command`    | `^1.0.0`  | ✅ Current — Cliffy 1.x stable on JSR |
| `@std/assert`        | `^1.0.19` | ✅ Current                            |
| `@std/cli`           | `^1.0.0`  | ✅ Current                            |
| `@std/yaml`          | `^1.0.12` | ✅ Current                            |
| `@okta/okta-auth-js` | `^8.0.0`  | ✅ Current — major v8 (IDX API)       |

### Deprecated API Sweep

- No usage of `Deno.Buffer`, `Deno.copy`, `Deno.readAll`, `Deno.writeAll`
- No usage of removed `std/encoding`, `std/io` (pre-2.0) modules
- No `https://` import URLs in source — all via `deno.json` imports map
- No `// deno-lint-ignore` or `// deno-ts-ignore` suppressions

### Ongoing Recommendations

- Upgrade `@okta/okta-auth-js` to latest v8 patch when a new minor is released
- Run `deno outdated` periodically to surface new JSR patch versions
- Consider adding `"nodeModulesDir": false` to `deno.json` once all npm deps support it (reduces disk footprint in CI)
