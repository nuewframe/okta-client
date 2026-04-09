# Nuewframe OAuth CLI

[![CI](https://github.com/nuewframe/nfauth/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nuewframe/nfauth/actions/workflows/ci.yml)

A Deno CLI for OAuth 2.0 / OIDC authentication and token management. It writes tokens to `~/.nuewframe/credential.json` for use by other tools.

## Why

Managing OAuth/OIDC tokens from the command line is clunky. `nfauth` streamlines browser login, headless code exchange, service-to-service token acquisition, and saved-token inspection in one CLI.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/nuewframe/nfauth/main/install.sh | sh
```

Auto-detects your platform (macOS arm64/x64, Linux x64) and installs to `/usr/local/bin`.
Set `INSTALL_DIR` or `VERSION` to override:

```bash
VERSION=v1.2.0 INSTALL_DIR=~/.local/bin \
  curl -fsSL https://raw.githubusercontent.com/nuewframe/nfauth/main/install.sh | sh
```

### From source (Deno required)

```bash
git clone https://github.com/nuewframe/nfauth.git
cd nfauth
deno task dev --help
```

## Quick Start

```bash
# 1. Initialize config
nfauth config init

# 2. Add your auth environment
nfauth config add https://your-domain.okta.com your-client-id your-client-secret \
  --redirect-uri http://localhost:7879/callback

# 3. Log in
nfauth login browser --env dev

# 4. Use the token
nfauth token access
nfauth token userinfo
```

## Command Reference

### Login Flows (End User)

#### Default interactive login

```bash
nfauth login browser [--env <env>] [--namespace <ns>]
```

Opens the browser and completes login in one command when callback capture is available.

##### `login browser` override flags

| Flag                                             | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ |
| `--auth-url <url>`                               | Override authorization endpoint URL              |
| `--token-url <url>`                              | Override token endpoint URL                      |
| `--client-id <id>`                               | Override OAuth client ID                         |
| `--client-secret <secret>`                       | Override OAuth client secret                     |
| `--scope <scope>`                                | Override OAuth scope                             |
| `--redirect-uri <uri>`                           | Override redirect URI                            |
| `--client-credentials-mode basic\|in_body\|none` | Override client authentication mode              |
| `--param <k=v,...>`                              | Add request parameters to all OAuth requests     |
| `--param-auth <k=v,...>`                         | Add request parameters to authorize request only |
| `--param-token <k=v,...>`                        | Add request parameters to token request only     |
| `--header <k=v,...>`                             | Add request headers to all token requests        |
| `--header-auth <k=v,...>`                        | Add request headers to authorize request only    |
| `--header-token <k=v,...>`                       | Add request headers to token request only        |

#### Headless or remote login (manual two-step)

```bash
nfauth login url [--env <env>] [--namespace <ns>]
nfauth login code <code> [--env <env>] [--namespace <ns>]
nfauth login code --url "<full-redirect-url>" [--env <env>] [--namespace <ns>]
```

Use this when the current machine cannot launch a browser or cannot host a callback.
`login url` starts the flow and saves PKCE state. `login code` completes the token exchange.

The pending login transaction stores:

- environment and namespace
- redirect URI and scope
- PKCE verifier/challenge, state, and nonce
- creation and expiry timestamps (10-minute validity window)

`login code` validates and consumes this transaction, and requires matching env/namespace if you
pass them explicitly.

##### `login url` and `login code` override flags

Flags for `login url` (authorize request):

| Flag                                             | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ |
| `--auth-url <url>`                               | Override authorization endpoint URL              |
| `--token-url <url>`                              | Override token endpoint URL                      |
| `--client-id <id>`                               | Override OAuth client ID                         |
| `--client-secret <secret>`                       | Override OAuth client secret                     |
| `--scope <scope>`                                | Override OAuth scope                             |
| `--redirect-uri <uri>`                           | Override redirect URI                            |
| `--client-credentials-mode basic\|in_body\|none` | Override client authentication mode              |
| `--param <k=v,...>`                              | Add request parameters to all OAuth requests     |
| `--param-auth <k=v,...>`                         | Add request parameters to authorize request only |
| `--param-token <k=v,...>`                        | Add request parameters to token request only     |
| `--header <k=v,...>`                             | Add request headers to all token requests        |
| `--header-auth <k=v,...>`                        | Add request headers to authorize request only    |
| `--header-token <k=v,...>`                       | Add request headers to token request only        |

Flags for `login code` (token exchange request):

| Flag                                             | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ |
| `--token-url <url>`                              | Override token endpoint URL                      |
| `--client-id <id>`                               | Override OAuth client ID                         |
| `--client-secret <secret>`                       | Override OAuth client secret                     |
| `--client-credentials-mode basic\|in_body\|none` | Override client authentication mode              |
| `--param <k=v,...>`                              | Add request parameters to all OAuth requests     |
| `--param-auth <k=v,...>`                         | Add request parameters to authorize request only |
| `--param-token <k=v,...>`                        | Add request parameters to token request only     |
| `--header <k=v,...>`                             | Add request headers to all token requests        |
| `--header-auth <k=v,...>`                        | Add request headers to authorize request only    |
| `--header-token <k=v,...>`                       | Add request headers to token request only        |

**Examples:**

```bash
# Override the authorization endpoint
nfauth login url --auth-url https://custom.example.com/oauth2/v1/authorize

# Add an audience parameter to authorize request only, resource to token request only
nfauth login url \
  --param-auth "audience=api://default" \
  --param-token "resource=https://api.example.com"

# Override both endpoints for the code exchange
nfauth login code <code> \
  --token-url https://custom.example.com/oauth2/v1/token \
  --header-token "X-Tenant=prod"
```

#### Direct username/password login (high-trust or legacy)

```bash
nfauth login password <username> [--env <env>] [--namespace <ns>]
```

Password is read from a masked stdin prompt — never from a flag.

### Service-to-Service

#### OAuth 2.0 client credentials

```bash
nfauth service token [--env <env>] [--namespace <ns>] [--scope "api.read"]
```

Use this for machine-to-machine calls with no end user.

##### `service token` override flags

| Flag                                             | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ |
| `--auth-url <url>`                               | Override authorization endpoint URL              |
| `--token-url <url>`                              | Override token endpoint URL                      |
| `--client-id <id>`                               | Override OAuth client ID                         |
| `--client-secret <secret>`                       | Override OAuth client secret                     |
| `--scope <scope>`                                | Override OAuth scope                             |
| `--client-credentials-mode basic\|in_body\|none` | Override client authentication mode              |
| `--param <k=v,...>`                              | Add request parameters to all OAuth requests     |
| `--param-auth <k=v,...>`                         | Add request parameters to authorize request only |
| `--param-token <k=v,...>`                        | Add request parameters to token request only     |
| `--header <k=v,...>`                             | Add request headers to all token requests        |
| `--header-auth <k=v,...>`                        | Add request headers to authorize request only    |
| `--header-token <k=v,...>`                       | Add request headers to token request only        |

**Examples:**

```bash
# Use a different token endpoint and add a resource parameter
nfauth service token \
  --token-url https://custom.example.com/oauth2/v1/token \
  --param-token "resource=https://api.example.com" \
  --scope "api.read"

# Add a custom header to token requests only
nfauth service token --header-token "X-Api-Key=my-key"
```

### Token Investigation and Usage

#### Saved auth result summary

```bash
nfauth token info
```

Shows token type, scope, save timestamp, expiry details, and whether ID/refresh tokens are present.

#### Get raw saved tokens

```bash
nfauth token access
nfauth token id
nfauth token refresh
```

Use `token access` when you need to pass a bearer token to another tool or API call.

#### Inspect JWT claims

```bash
nfauth token claims access
nfauth token claims id
nfauth token claims --token <token>
```

Decodes JWT claims from saved or provided tokens. If a token is not a JWT, decoding fails.

#### Query OIDC user profile

```bash
nfauth token userinfo
nfauth token userinfo --token <access-token>
nfauth token userinfo --userinfo-url https://custom.example.com/userinfo
```

Queries the UserInfo endpoint using either the saved access token or a provided one.
By default the userinfo URL is derived from the configured token URL.
Use `--userinfo-url` to target a custom endpoint directly, or `--token-url` to change
the base from which the userinfo URL is derived.

| Flag                   | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `--token-url <url>`    | Override token endpoint (userinfo URL derived from this) |
| `--userinfo-url <url>` | Override userinfo endpoint directly                      |
| `--client-id <id>`     | Override OAuth client ID                                 |

#### OAuth 2.0 vs OIDC outputs

- `token access`: OAuth 2.0 bearer token for API authorization.
- `token id`: OIDC identity token for client-side identity claims.
- `token userinfo`: OIDC profile endpoint lookup using an access token.

Use access tokens for API calls, and use ID token/userinfo only for identity/profile inspection.

### Configuration

```bash
nfauth config init                 # create ~/.nuewframe/nfauth/ with starter config
nfauth config show                 # print current config as JSON
nfauth config list                 # list all environments and namespaces
nfauth config add <domain> <cid> <client-secret> --redirect-uri <uri>
nfauth config set-default --env prod --namespace default
```

### Global Options

All commands accept:

| Flag                            | Description                                 |
| ------------------------------- | ------------------------------------------- |
| `-e, --env <env>`               | Auth environment (overrides config default) |
| `-n, --namespace <ns>`          | Config namespace (overrides config default) |
| `--env-file <path>`             | Config YAML file path override              |
| `-v, --verbose`                 | Enable debug output                         |
| `--log-level none\|info\|debug` | Log verbosity level                         |

## Configuration

`~/.nuewframe/nfauth/config.yaml`:

```yaml
okta:
  environments:
    dev:
      default:
        domain: https://your-dev-domain.okta.com
        clientId: your-client-id
        auth:
          clientSecret: your-client-secret
        redirectUri: http://localhost:7879/callback
        scope: openid profile email
current:
  env: dev
  namespace: default
```

## Credential File

After login, tokens are written to `~/.nuewframe/credential.json`:

```json
{
  "access_token": "eyJ...",
  "id_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

This file is consumed by [`gql-client`](https://github.com/nuewframe/gql-client) and any other tool that needs an OAuth access token.

## Integration with gql-client

```http
# In a .http file used by gql-client:
@TOKEN: {{ $( nfauth token access ) }}

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query Me { me { id email } }
```

## Troubleshooting

### No configuration found

Symptom:

- `No configuration found`

Fix:

1. Initialize config: `nfauth config init`
2. Add an environment entry with `auth.clientSecret`
3. Re-run your command

Validated by integration test:

- `Integration - service token fails clearly when no unified config exists`

### Invalid metadata override pairs

Symptom:

- `Configuration error: invalid key=value pair '...'`

Fix:

1. Use `k=v` pairs only
2. Separate multiple values with commas (example: `--param-token "resource=https://api,audience=api://default"`)
3. Avoid empty keys or values

Validated by integration tests:

- `Integration - login url rejects malformed --param-auth key=value pairs`
- `Integration - service token rejects malformed --header-token key=value pairs`

### Invalid client credentials mode

Symptom:

- `--client-credentials-mode must be one of basic, in_body, none`

Fix:

1. Use one of: `basic`, `in_body`, `none`
2. Check command spelling and casing

Validated by integration tests:

- `Integration - login url rejects invalid --client-credentials-mode value`
- `Integration - service token rejects invalid --client-credentials-mode value`

### Missing redirect URI in auth code flow

Symptom:

- `No redirect URI configured`

Fix:

1. Set `redirectUri` in selected env/namespace config
2. Or pass `--redirect-uri` at command time

Validated by integration test:

- `Integration - login url fails clearly when redirect URI is missing`

### Missing client secret in client credentials flow

Symptom:

- `clientSecret is required when clientCredentialsMode is basic or in_body`

Fix:

1. Set `auth.clientSecret` in config
2. Or pass `--client-secret` at command time
3. If using a public-client pattern, set `--client-credentials-mode none`

Validated by integration test:

- `Integration - service token fails when client secret is missing in basic mode`

## Development

```bash
deno task dev --help          # run from source
deno task check               # fmt + lint + tests (same gate used by CI and pre-push)
deno task test                # run all tests
deno task lint                # deno lint
deno task fmt                 # deno fmt
deno task hooks               # install managed pre-push hook
deno task build:all           # compile all platform binaries
```

Follow the repository workflow: define behavior in tests first, keep command wiring separate from service logic, and execute planned refactors after tests are green.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
