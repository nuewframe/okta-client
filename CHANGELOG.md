# Changelog

All notable changes to `okta-client` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Nothing yet

## [1.0.1] - 2024-01-01

### Added

- Standalone repository — extracted from `okta-gql-clients` monorepo
- `context.md` and `tool-spec.md` for AI-assisted development
- `.github/instructions/` and `.github/skills/` for Copilot integration

### Fixed

- No code changes from monorepo extraction

## [1.0.0] - 2024-01-01

### Added

- `login <username>` — direct username/password login via Okta IDX API (`@okta/okta-auth-js`)
- `login-browser` — browser-based PKCE flow (CDP / localhost callback / paste modes)
- `auth-url` — generate PKCE authorization URL
- `auth-url exchange-code <code>` — exchange auth code for tokens
- `client-credentials` — machine-to-machine token request
- `user-info [token]` — fetch user profile from `/userinfo` endpoint
- `decode [token]` — decode JWT header + payload + expiry
- `config init` — initialize `~/.nuewframe/config.yaml`
- `config show` — display current config
- `config add` — add environment/namespace via CLI flags
- `config set-default` — set active environment/namespace
- `config list` — list all environments and namespaces
- `get access-token` — print raw access token for scripting
- PKCE implementation (RFC 7636, S256 challenge method)
- Masked stdin password input (never as a flag)
- Token abbreviation in all log output for security
- Chrome DevTools Protocol (CDP) browser automation utilities
