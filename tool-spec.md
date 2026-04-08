# okta-client — Tool Specification

## Global Options

Every subcommand inherits these options (declared with `.globalOption` on the root command):

| Flag                   | Type              | Default                    | Description                                  |
| ---------------------- | ----------------- | -------------------------- | -------------------------------------------- |
| `-e, --env <env>`      | string            | config `current.env`       | Okta environment to use                      |
| `-n, --namespace <ns>` | string            | config `current.namespace` | Config namespace                             |
| `-v, --verbose`        | boolean           | false                      | Enable verbose (debug) output                |
| `--log-level <level>`  | none\|info\|debug | info                       | Log verbosity                                |
| `--env-file <path>`    | string            | —                          | Path to config YAML file (overrides default) |

---

## Commands

### `auth-url`

Generate a PKCE authorization URL to start the browser-based OAuth flow.

```
okta-client auth-url [options]
```

| Option                | Type   | Description                                 |
| --------------------- | ------ | ------------------------------------------- |
| `-s, --state <state>` | string | State parameter (auto-generated if omitted) |
| `--nonce <nonce>`     | string | Nonce parameter (auto-generated if omitted) |

**Output**: Prints the full authorization URL to stdout.

**Example**:

```bash
okta-client auth-url --env dev
okta-client auth-url --env dev --namespace cards
```

#### `auth-url exchange-code <code>`

Exchange an authorization code for tokens (completes the PKCE flow).

```
okta-client auth-url exchange-code <code> [options]
```

**Output**: Saves tokens to `~/.nuewframe/credential.json`, prints confirmation.

---

### `login <username>`

Direct username/password login using the Okta IDX API (via `@okta/okta-auth-js`).
Password is read from masked stdin — never from a flag.

```
okta-client login <username> [options]
```

**Output**: Saves tokens to `~/.nuewframe/credential.json`, prints confirmation.

**Example**:

```bash
okta-client login user@example.com --env dev
```

---

### `login-browser`

Browser-based PKCE login. Supports three modes:

```
okta-client login-browser [options]
```

| Option                 | Type   | Default      | Description           |
| ---------------------- | ------ | ------------ | --------------------- |
| `--redirect-uri <uri>` | string | config value | Override redirect URI |
| `--port <port>`        | number | 7879         | Local callback port   |

**Modes** (auto-detected):

1. **CDP** — automates Chrome via Chrome DevTools Protocol (requires Chrome)
2. **Callback** — starts local HTTP server, opens browser, waits for callback
3. **Paste** — prints URL for manual browser use; prompts user to paste the code

**Output**: Saves tokens to `~/.nuewframe/credential.json`.

---

### `client-credentials`

Machine-to-machine authentication using the client_credentials grant.

```
okta-client client-credentials [options]
```

| Option            | Type   | Default                | Description             |
| ----------------- | ------ | ---------------------- | ----------------------- |
| `--scope <scope>` | string | `openid profile email` | OAuth scopes to request |

**Output**: Saves tokens to `~/.nuewframe/credential.json`.

**Example**:

```bash
okta-client client-credentials --env prod --scope "api.read api.write"
```

---

### `user-info [token]`

Fetch user profile from the Okta `/userinfo` endpoint.

```
okta-client user-info [token] [options]
```

Arguments:

- `[token]` — Optional. Use this access token instead of the one in `credential.json`.

**Output**: JSON user profile to stdout.

**Example**:

```bash
okta-client user-info
okta-client user-info eyJhbGciOiJSUzI1NiJ9...
```

---

### `decode [token]`

Decode a JWT to inspect its header and payload claims, and print the expiry time.

```
okta-client decode [token] [options]
```

Arguments:

- `[token]` — Optional. Decode this token. Default: reads `access_token` from `credential.json`.

| Option       | Type    | Description                                 |
| ------------ | ------- | ------------------------------------------- |
| `--id-token` | boolean | Decode `id_token` instead of `access_token` |

**Output**: Pretty-printed header + payload JSON + expiry line.

**Example**:

```bash
okta-client decode
okta-client decode --id-token
okta-client decode eyJhbGciOiJSUzI1NiJ9...
```

---

### `config`

Manage `~/.nuewframe/okta-client/config.yaml`.

```
okta-client config <subcommand>
```

#### `config init`

Initialize the `~/.nuewframe/` directory with a starter `config.yaml`.

```bash
okta-client config init
```

Prints an example config to stdout and creates the directory.

#### `config show`

Print the current config file as JSON.

```bash
okta-client config show
```

#### `config add <domain> <clientId> <apiToken>`

Add a new environment/namespace entry.

```
okta-client config add <domain> <clientId> <apiToken> [options]
```

| Option                  | Type   | Default                | Description        |
| ----------------------- | ------ | ---------------------- | ------------------ |
| `-e, --env <env>`       | string | `dev`                  | Environment name   |
| `-n, --namespace <ns>`  | string | `default`              | Namespace name     |
| `--redirect-uri <uri>`  | string | _required_             | OAuth redirect URI |
| `--scope <scope>`       | string | `openid profile email` | OAuth scopes       |
| `--discovery-url <url>` | string | —                      | OIDC discovery URL |

**Example**:

```bash
okta-client config add https://my.okta.com abc123 apitoken \
  --env prod --redirect-uri http://localhost:7879/callback
```

#### `config set-default`

Set the active environment/namespace used by all commands.

```
okta-client config set-default [options]
```

| Option                 | Type   | Description                  |
| ---------------------- | ------ | ---------------------------- |
| `-e, --env <env>`      | string | Environment name to activate |
| `-n, --namespace <ns>` | string | Namespace to activate        |

**Example**:

```bash
okta-client config set-default --env prod --namespace default
```

#### `config list`

List all environments and namespaces in the config file.

```bash
okta-client config list
```

---

### `get access-token`

Print the raw access token from `~/.nuewframe/credential.json`.
Useful for scripting and piping to other tools.

```
okta-client get access-token
```

**Output**: Raw access token string (no newline decoration), suitable for piping.

**Example**:

```bash
# Use in shell variable
TOKEN=$(okta-client get access-token)

# Pipe to another command
okta-client get access-token | pbcopy

# Use in .http file
@TOKEN: {{ $( okta-client get access-token ) }}
```

---

## Exit Codes

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| `0`  | Success                                                     |
| `1`  | Runtime error (auth failure, config missing, network error) |

---

## Credential Output (all login commands)

All login commands write to `~/.nuewframe/credential.json`:

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

---

## Quick Reference

```bash
# Setup
okta-client config init
okta-client config add https://dev.okta.com abc clientsecret --redirect-uri http://localhost:7879/callback

# Authenticate
okta-client login user@example.com --env dev
okta-client login-browser --env dev
okta-client client-credentials --env prod

# Use credentials
okta-client user-info
okta-client get access-token
okta-client decode

# Inspect config
okta-client config show
okta-client config list
```
