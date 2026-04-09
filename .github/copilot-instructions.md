# Nuewframe OAuth CLI — Workspace Guidelines

## Tool Purpose

Nuewframe OAuth CLI is a standalone Deno CLI for Okta authentication and token management.
It implements OAuth 2.0 / OIDC flows and writes tokens to `~/.nuewframe/credential.json`
so that other tools (e.g. `gql-client`) can consume them.

## Architecture

```
main.ts                   ← CLI entry point; registers all commands with Cliffy
commands/                 ← One file per subcommand; import from services/ and utils/
  auth.ts                 ← auth-url + exchange-code (PKCE flow)
  login.ts                ← Direct username/password login
  login-browser.ts        ← Browser-based login (CDP / localhost / paste)
  client-credentials.ts   ← Machine-to-machine token request
  user-info.ts            ← Fetch user profile using saved token
  decode-token.ts         ← Decode and inspect JWT claims
  config.ts               ← Manage ~/.nuewframe/nfauth/config.yaml
  get.ts                  ← Print raw token values (e.g. get access-token)
config/
  app.config.ts           ← Load/save ~/.nuewframe/nfauth/config.yaml (YAML)
services/
  okta.service.ts         ← Core OAuth/OIDC HTTP calls (no third-party SDK)
  okta-login.service.ts   ← Direct login via @okta/okta-auth-js (IDX API)
utils/
  credentials.ts          ← Load/save ~/.nuewframe/credential.json
  jwt.ts                  ← Pure-JS JWT header/payload decoder (no verification)
  logger.ts               ← Logger class (none/info/debug levels)
  pkce.ts                 ← RFC 7636 PKCE utilities (verifier, S256 challenge)
  cdp.ts                  ← Chrome DevTools Protocol helpers for browser login
  okta-service-options.ts ← Build OktaConfig from OktaEnvironment
```

**Integration contract**: this tool writes `~/.nuewframe/credential.json`. The
`gql-client` reads `access_token` from that file. The credential schema is:

```json
{
  "access_token": "...",
  "id_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Build & Test

```bash
deno task dev --help            # run from source
deno task test                  # run all tests
deno task lint                  # deno lint
deno task fmt                   # deno fmt
deno task build:all             # compile all platform targets → dist/
deno task release               # bump version + tag
```

## Code Style

Enforced by `deno fmt` and `deno lint`. Settings in `deno.json`:

- 2-space indent, single quotes, semicolons, 100-char line width
- `strict: true`, libs: `ES2022` + `DOM` + `deno.ns`

Never use `--no-check` or manual format overrides.

## Conventions

### Imports

- JSR and npm packages: declared in `deno.json` `imports` map, used bare
- Internal: relative with `.ts` extension (`../config/app.config.ts`)
- Never use `https://` URLs or `jsr:`/`npm:` directly in source files

### Naming

- Commands: kebab-case verb or verb-noun (`login-browser.ts`, `decode-token.ts`)
- Services: `<name>.service.ts`
- Tests: `<original>_test.ts` (underscore, not dot)

### Error Handling

- Catch at command handler level; never propagate raw errors to the user
- Surface with `console.error('❌ ...')` and `Deno.exit(1)`
- Use `error instanceof Error ? error.message : String(error)` guard

### Credential Security

- Never log full tokens — abbreviate: `token.substring(0, 6) + '...'`
- Never accept passwords as CLI flags (use masked stdin input)
- Read credentials with file I/O (`utils/credentials.ts`); never from env vars directly

### Permissions

Only what commands actually need:
`--allow-env --allow-net --allow-read --allow-write --allow-run`

(`--allow-run` is used only for browser-open OS commands)

## Config File Location

`~/.nuewframe/nfauth/config.yaml` — YAML file with environments/profiles structure.
Schema:

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
