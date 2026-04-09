# Nuewframe OAuth CLI — Tool Specification

## Global Options

Every subcommand inherits these options (declared with `.globalOption` on the root command):

| Flag                      | Type              | Default                  | Description                                  |
| ------------------------- | ----------------- | ------------------------ | -------------------------------------------- |
| `-e, --env <env>`         | string            | config `current.env`     | Auth environment to use                      |
| `-p, --profile <profile>` | string            | config `current.profile` | Config profile                               |
| `-v, --verbose`           | boolean           | false                    | Enable verbose (debug) output                |
| `--log-level <level>`     | none\|info\|debug | info                     | Log verbosity                                |
| `--env-file <path>`       | string            | —                        | Path to config YAML file (overrides default) |

---

## Commands

### `auth-url`

Generate a PKCE authorization URL to start the browser-based OAuth flow.

```
nfauth auth-url [options]
```

| Option                | Type   | Description                                 |
| --------------------- | ------ | ------------------------------------------- |
| `-s, --state <state>` | string | State parameter (auto-generated if omitted) |
| `--nonce <nonce>`     | string | Nonce parameter (auto-generated if omitted) |

**Output**: Prints the full authorization URL to stdout.

**Example**:

```bash
nfauth auth-url --env dev
nfauth auth-url --env dev --profile cards
```

#### `auth-url exchange-code <code>`

Exchange an authorization code for tokens (completes the PKCE flow).

```
nfauth auth-url exchange-code <code> [options]
```

**Output**: Saves tokens to `~/.nuewframe/credential.json`, prints confirmation.

---

### `login <username>`

Direct username/password login using the Okta IDX API (via `@okta/okta-auth-js`).
Password is read from masked stdin — never from a flag.

```
nfauth login <username> [options]
```

**Output**: Saves tokens to `~/.nuewframe/credential.json`, prints confirmation.

**Example**:

```bash
nfauth login user@example.com --env dev
```

---

### `login-browser`

Browser-based PKCE login. Supports three modes:

```
nfauth login-browser [options]
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
nfauth client-credentials [options]
```

| Option            | Type   | Default                | Description             |
| ----------------- | ------ | ---------------------- | ----------------------- |
| `--scope <scope>` | string | `openid profile email` | OAuth scopes to request |

**Output**: Saves tokens to `~/.nuewframe/credential.json`.

**Example**:

```bash
nfauth client-credentials --env prod --scope "api.read api.write"
```

---

### `user-info [token]`

Fetch user profile from the Okta `/userinfo` endpoint.

```
nfauth user-info [token] [options]
```

Arguments:

- `[token]` — Optional. Use this access token instead of the one in `credential.json`.

**Output**: JSON user profile to stdout.

**Example**:

```bash
nfauth user-info
nfauth user-info eyJhbGciOiJSUzI1NiJ9...
```

---

### `decode [token]`

Decode a JWT to inspect its header and payload claims, and print the expiry time.

```
nfauth decode [token] [options]
```

Arguments:

- `[token]` — Optional. Decode this token. Default: reads `access_token` from `credential.json`.

| Option       | Type    | Description                                 |
| ------------ | ------- | ------------------------------------------- |
| `--id-token` | boolean | Decode `id_token` instead of `access_token` |

**Output**: Pretty-printed header + payload JSON + expiry line.

**Example**:

```bash
nfauth decode
nfauth decode --id-token
nfauth decode eyJhbGciOiJSUzI1NiJ9...
```

---

### `config`

Manage `~/.nuewframe/nfauth/config.yaml`.

```
nfauth config <subcommand>
```

#### `config init`

Initialize the `~/.nuewframe/` directory with a starter `config.yaml`.

```bash
nfauth config init
```

Prints an example config to stdout and creates the directory.

#### `config show`

Print the current config file as JSON.

```bash
nfauth config show
```

#### `config add <domain> <clientId> <clientSecret>`

Add a new environment/profile entry.

```
nfauth config add <domain> <clientId> <clientSecret> [options]
```

| Option                    | Type   | Default                | Description        |
| ------------------------- | ------ | ---------------------- | ------------------ |
| `-e, --env <env>`         | string | `dev`                  | Environment name   |
| `-p, --profile <profile>` | string | `default`              | Profile name       |
| `--redirect-uri <uri>`    | string | _required_             | OAuth redirect URI |
| `--scope <scope>`         | string | `openid profile email` | OAuth scopes       |
| `--discovery-url <url>`   | string | —                      | OIDC discovery URL |

**Example**:

```bash
nfauth config add https://my.okta.com abc123 clientsecret \
  --env prod --redirect-uri http://localhost:7879/callback
```

#### `config set-default`

Set the active environment/profile used by all commands.

```
nfauth config set-default [options]
```

| Option                    | Type   | Description                  |
| ------------------------- | ------ | ---------------------------- |
| `-e, --env <env>`         | string | Environment name to activate |
| `-p, --profile <profile>` | string | Profile to activate          |

**Example**:

```bash
nfauth config set-default --env prod --profile default
```

#### `config list`

List all environments and profiles in the config file.

```bash
nfauth config list
```

---

### `get access-token`

Print the raw access token from `~/.nuewframe/credential.json`.
Useful for scripting and piping to other tools.

```
nfauth get access-token
```

**Output**: Raw access token string (no newline decoration), suitable for piping.

**Example**:

```bash
# Use in shell variable
TOKEN=$(nfauth get access-token)

# Pipe to another command
nfauth get access-token | pbcopy

# Use in .http file
@TOKEN: {{ $( nfauth get access-token ) }}
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
nfauth config init
nfauth config add https://dev.okta.com abc clientsecret --redirect-uri http://localhost:7879/callback

# Authenticate
nfauth login user@example.com --env dev
nfauth login-browser --env dev
nfauth client-credentials --env prod

# Use credentials
nfauth user-info
nfauth get access-token
nfauth decode

# Inspect config
nfauth config show
nfauth config list
```
