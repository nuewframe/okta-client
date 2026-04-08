# okta-client

[![CI](https://github.com/nuewframe/okta-client/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nuewframe/okta-client/actions/workflows/ci.yml)

A Deno CLI for Okta authentication and token management. Implements OAuth 2.0 / OIDC flows and writes tokens to `~/.nuewframe/credential.json` for use by other tools.

## Why

Managing Okta tokens from the command line is clunky. `okta-client` streamlines OAuth 2.0 / OIDC login, service-to-service token acquisition, and saved-token inspection in one CLI.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/nuewframe/okta-client/main/install.sh | sh
```

Auto-detects your platform (macOS arm64/x64, Linux x64) and installs to `/usr/local/bin`.
Set `INSTALL_DIR` or `VERSION` to override:

```bash
VERSION=v1.2.0 INSTALL_DIR=~/.local/bin \
  curl -fsSL https://raw.githubusercontent.com/nuewframe/okta-client/main/install.sh | sh
```

### From source (Deno required)

```bash
git clone https://github.com/nuewframe/okta-client.git
cd okta-client
deno task dev --help
```

## Quick Start

```bash
# 1. Initialize config
okta-client config init

# 2. Add your Okta environment
okta-client config add https://your-domain.okta.com your-client-id your-api-token \
  --redirect-uri http://localhost:7879/callback

# 3. Log in
okta-client login browser --env dev

# 4. Use the token
okta-client token access
okta-client token userinfo
```

## Command Reference

### Login Flows (End User)

#### Default interactive login

```bash
okta-client login browser [--env <env>] [--namespace <ns>]
```

Opens the browser and completes login in one command when callback capture is available.

#### Headless or remote login (manual two-step)

```bash
okta-client login url [--env <env>] [--namespace <ns>]
okta-client login code <code> [--env <env>] [--namespace <ns>]
okta-client login code --url "<full-redirect-url>" [--env <env>] [--namespace <ns>]
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

#### Direct username/password login (high-trust or legacy)

```bash
okta-client login password <username> [--env <env>] [--namespace <ns>]
```

Password is read from a masked stdin prompt — never from a flag.

### Service-to-Service

#### OAuth 2.0 client credentials

```bash
okta-client service token [--env <env>] [--namespace <ns>] [--scope "api.read"]
```

Use this for machine-to-machine calls with no end user.

### Token Investigation and Usage

#### Saved auth result summary

```bash
okta-client token info
```

Shows token type, scope, save timestamp, expiry details, and whether ID/refresh tokens are present.

#### Get raw saved tokens

```bash
okta-client token access
okta-client token id
okta-client token refresh
```

Use `token access` when you need to pass a bearer token to another tool or API call.

#### Inspect JWT claims

```bash
okta-client token claims access
okta-client token claims id
okta-client token claims --token <token>
```

Decodes JWT claims from saved or provided tokens. If a token is not a JWT, decoding fails.

#### Query OIDC user profile

```bash
okta-client token userinfo
okta-client token userinfo --token <access-token>
```

Queries the UserInfo endpoint using either the saved access token or a provided one.

#### OAuth 2.0 vs OIDC outputs

- `token access`: OAuth 2.0 bearer token for API authorization.
- `token id`: OIDC identity token for client-side identity claims.
- `token userinfo`: OIDC profile endpoint lookup using an access token.

Use access tokens for API calls, and use ID token/userinfo only for identity/profile inspection.

### Configuration

```bash
okta-client config init                 # create ~/.nuewframe/okta-client/ with starter config
okta-client config show                 # print current config as JSON
okta-client config list                 # list all environments and namespaces
okta-client config add <domain> <cid> <apitoken> --redirect-uri <uri>
okta-client config set-default --env prod --namespace default
```

### Global Options

All commands accept:

| Flag                            | Description                                 |
| ------------------------------- | ------------------------------------------- |
| `-e, --env <env>`               | Okta environment (overrides config default) |
| `-n, --namespace <ns>`          | Config namespace (overrides config default) |
| `--env-file <path>`             | Config YAML file path override              |
| `-v, --verbose`                 | Enable debug output                         |
| `--log-level none\|info\|debug` | Log verbosity level                         |

## Configuration

`~/.nuewframe/okta-client/config.yaml`:

```yaml
okta:
  environments:
    dev:
      default:
        domain: https://your-dev-domain.okta.com
        clientId: your-client-id
        apiToken: your-api-token
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

This file is consumed by [`gql-client`](https://github.com/nuewframe/gql-client) and any other tool that needs an Okta token.

## Integration with gql-client

```http
# In a .http file used by gql-client:
@TOKEN: {{ $( okta-client token access ) }}

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query Me { me { id email } }
```

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
