# okta-client

[![CI](https://github.com/nuewframe/okta-client/actions/workflows/ci.yml/badge.svg)](https://github.com/nuewframe/okta-client/actions/workflows/ci.yml)

A Deno CLI for Okta authentication and token management. Implements OAuth 2.0 / OIDC flows and writes tokens to `~/.nuewframe/credential.json` for use by other tools.

## Why

Managing Okta tokens from the command line is clunky. `okta-client` makes it one command — `okta-client login user@example.com` — and writes a credential file that any script or tool (like [`gql-client`](https://github.com/nuewframe/gql-client)) can consume.

## Install

### macOS (Apple Silicon)

```bash
curl -fsSL https://github.com/nuewframe/okta-client/releases/latest/download/okta-client-mac-arm \
  -o /usr/local/bin/okta-client && chmod +x /usr/local/bin/okta-client
```

### macOS (Intel)

```bash
curl -fsSL https://github.com/nuewframe/okta-client/releases/latest/download/okta-client-mac-x64 \
  -o /usr/local/bin/okta-client && chmod +x /usr/local/bin/okta-client
```

### Linux (x86_64)

```bash
curl -fsSL https://github.com/nuewframe/okta-client/releases/latest/download/okta-client-linux \
  -o /usr/local/bin/okta-client && chmod +x /usr/local/bin/okta-client
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
okta-client login user@example.com --env dev

# 4. Use the token
okta-client get access-token
okta-client user-info
```

## Command Reference

### Authentication

#### Direct login (username + password)

```bash
okta-client login <username> [--env <env>] [--namespace <ns>]
```

Password is read from a masked stdin prompt — never from a flag.

#### Browser PKCE flow

```bash
okta-client login-browser [--env <env>] [--port 7879]
```

Opens the browser and waits for the OAuth callback on `localhost`.

#### Machine-to-machine (client credentials)

```bash
okta-client client-credentials [--env <env>] [--scope "openid api.read"]
```

#### PKCE flow (manual)

```bash
okta-client auth-url --env dev          # prints authorization URL
okta-client auth-url exchange-code CODE # exchanges the code for tokens
```

### Token Inspection

```bash
okta-client get access-token            # print raw access token
okta-client user-info                   # fetch user profile JSON
okta-client decode                      # decode JWT claims + expiry
okta-client decode --id-token           # decode id_token instead
```

### Configuration

```bash
okta-client config init                 # create ~/.nuewframe/ with starter config
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
| `-v, --verbose`                 | Enable debug output                         |
| `--log-level none\|info\|debug` | Log verbosity level                         |

## Configuration

`~/.nuewframe/config.yaml`:

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
@TOKEN: {{ $( okta-client get access-token ) }}

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query Me { me { id email } }
```

## Development

```bash
deno task dev --help          # run from source
deno task test                # run all tests (27 tests)
deno task lint                # deno lint
deno task fmt                 # deno fmt
deno task build:all           # compile all platform binaries
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
