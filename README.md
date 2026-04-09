# Nuewframe OAuth CLI

[![CI](https://github.com/nuewframe/nfauth/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nuewframe/nfauth/actions/workflows/ci.yml)

Log into OAuth 2.0 / OIDC providers, store tokens in `~/.nuewframe/credential.json`, and print tokens for other CLI tools.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/nuewframe/nfauth/main/install.sh | sh
nfauth --help
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

## Use In 30 Seconds

```bash
# 1. Create local config
nfauth config init

# 2. Add an auth environment
nfauth config add https://your-domain.okta.com your-client-id your-client-secret \
  --redirect-uri http://localhost:7879/callback

# 3. Log in with your browser
nfauth login browser

# 4. Print the saved access token
nfauth token access
```

Tokens are written to `~/.nuewframe/credential.json` so other tools can reuse them.

## Choose Your Flow

| Goal                       | Command                                     | When to use it                                                  |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| Interactive end-user login | `nfauth login browser`                      | You can launch a browser and receive the callback locally       |
| Headless or remote login   | `nfauth login url` then `nfauth login code` | You need to copy the auth URL or paste back the redirect result |
| Machine-to-machine token   | `nfauth service token`                      | You need client credentials without an end user                 |

Use `nfauth <command> --help` for command-specific options and overrides.

## Common Tasks

### Get a saved access token

```bash
nfauth token access
```

### Show token summary

```bash
nfauth token info
```

### Inspect claims

```bash
nfauth token claims access
nfauth token claims id
nfauth token claims --token <token>
```

### Query the OIDC user profile

```bash
nfauth token userinfo
nfauth token userinfo --token <access-token>
nfauth token userinfo --userinfo-url https://custom.example.com/userinfo
```

### Use with gql-client

```http
@TOKEN: {{ $( nfauth token access ) }}

###
POST https://api.example.com/graphql HTTP/1.1
Authorization: Bearer {{ TOKEN }}
Content-Type: application/json

query Me { me { id email } }
```

## Login Flows

### Browser login

```bash
nfauth login browser [--env <env>] [--profile <profile>]
```

Opens the browser and completes login in one command when callback capture is available.

### Headless login

```bash
nfauth login url [--env <env>] [--profile <profile>]
nfauth login code <code> [--env <env>] [--profile <profile>]
nfauth login code --url "<full-redirect-url>" [--env <env>] [--profile <profile>]
```

Use this when the current machine cannot launch a browser or cannot host a callback.
`login url` starts the flow and saves PKCE state. `login code` completes the token exchange.

The pending login transaction stores environment/profile selection, redirect URI, scope,
PKCE verifier/challenge, state, nonce, and expiry timestamps. Transactions are valid for 10 minutes.

### Username/password login

```bash
nfauth login password <username> [--env <env>] [--profile <profile>]
```

Password is read from a masked stdin prompt, never from a flag.

### Service token

```bash
nfauth service token [--env <env>] [--profile <profile>] [--scope "api.read"]
```

Use this for machine-to-machine calls with no end user.

## Command Reference

### Config commands

```bash
nfauth config init
nfauth config show
nfauth config list
nfauth config add <issuer-uri> <cid> [client-secret] --redirect-uri <uri>
nfauth config set-default --env prod --profile default
```

### Token commands

```bash
nfauth token info
nfauth token access
nfauth token id
nfauth token refresh
nfauth token claims access
nfauth token claims id
nfauth token userinfo
```

### Global options

All commands accept:

| Flag                            | Description                    |
| ------------------------------- | ------------------------------ |
| `-e, --env <env>`               | Auth environment override      |
| `-p, --profile <profile>`       | Config profile override        |
| `--env-file <path>`             | Config YAML file path override |
| `-v, --verbose`                 | Enable debug output            |
| `--log-level none\|info\|debug` | Log verbosity level            |

### Advanced request overrides

Login and service commands also support endpoint, scope, header, and parameter overrides such as:

- `--auth-url`
- `--token-url`
- `--client-id`
- `--client-secret`
- `--redirect-uri`
- `--scope`
- `--client-credentials-mode basic|in_body|none`
- `--param`, `--param-auth`, `--param-token`
- `--header`, `--header-auth`, `--header-token`

Use `--help` on the specific command to see the exact supported flags.

## Configuration

`~/.nuewframe/nfauth/config.yaml`:

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

`provider.discovery_url` is optional. If omitted, `nfauth` fetches discovery metadata from
`issuer_uri + '/.well-known/openid-configuration'`.

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

This file is consumed by [gql-client](https://github.com/nuewframe/gql-client) and any other tool
that needs an OAuth access token.

## Troubleshooting

### No configuration found

- Run `nfauth config init`
- Add an environment with `nfauth config add ...`
- Re-run the original command

### Invalid `key=value` pairs

- Use `k=v` format only
- Separate multiple values with commas
- Avoid empty keys or values

Example:

```bash
nfauth login url --param-token "resource=https://api,audience=api://default"
```

### Invalid client credentials mode

Use one of:

- `basic`
- `in_body`
- `none`

### Missing redirect URI in auth code flow

- Set `client.redirect_uri` in the selected config entry
- Or pass `--redirect-uri` at command time

### Missing client secret in client credentials flow

- Set `client.client_secret` in config
- Or pass `--client-secret` at command time
- If you are using a public client pattern, set `--client-credentials-mode none`

## Development

```bash
deno task dev --help
deno task check
deno task test
deno task lint
deno task fmt
deno task hooks
deno task build:all
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
