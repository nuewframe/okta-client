# Changelog

All notable changes to Nuewframe OAuth CLI are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [2.2.0](https://github.com/nuewframe/nfauth/compare/v2.1.0...v2.2.0) (2026-04-09)

### Features

- **auth:** finalize ADR-0001 config and login flow hardening ([#15](https://github.com/nuewframe/nfauth/issues/15)) ([f239198](https://github.com/nuewframe/nfauth/commit/f23919897c605c923a4a6491b18947bf3c4907b5))

## [2.1.0](https://github.com/nuewframe/nfauth/compare/v2.0.1...v2.1.0) (2026-04-09)

### Features

- **config:** migrate auth config to env/profile model ([#13](https://github.com/nuewframe/nfauth/issues/13)) ([c0b6c4a](https://github.com/nuewframe/nfauth/commit/c0b6c4a0b8140950c5dd3c1f360e16f8da2ed46b))

## [2.0.1](https://github.com/nuewframe/nfauth/compare/v2.0.0...v2.0.1) (2026-04-09)

### Bug Fixes

- **config:** add stripUndefinedDeep function and test for initializeConfig ([#10](https://github.com/nuewframe/nfauth/issues/10)) ([40caa93](https://github.com/nuewframe/nfauth/commit/40caa9332ec96bb215e0b82ea739aa2da5ebe55f))

## [2.0.0](https://github.com/nuewframe/nfauth/compare/v1.1.1...v2.0.0) (2026-04-09)

### ⚠ BREAKING CHANGES

- CLI command name changed from `okta-client` to `nfauth`, and the command surface was reorganized around provider-agnostic OAuth/OIDC flows.

### Features

- **cli:** complete login/service/token sprint with integration hardening ([#6](https://github.com/nuewframe/nfauth/issues/6)) ([e6240c8](https://github.com/nuewframe/nfauth/commit/e6240c8a401800ce435fe2d8a426fe3ac67b7cb4))
- rename CLI to nfauth and complete the OAuth/OIDC refactor ([#8](https://github.com/nuewframe/nfauth/issues/8)) ([0da679a](https://github.com/nuewframe/nfauth/commit/0da679a11fbd00c00e9485b44d74db6620278ee6))

## [1.1.1](https://github.com/nuewframe/nfauth/compare/v1.1.0...v1.1.1) (2026-03-26)

### Bug Fixes

- remove unnecessary whitespace in CHANGELOG.md ([4e1f507](https://github.com/nuewframe/nfauth/commit/4e1f5079f0a9aa91cb926f37754d48c2eda16f98))
- update version to use deno.json instead of hardcoded value ([bf68957](https://github.com/nuewframe/nfauth/commit/bf68957802643693af18b6891e1eff5f3a291f6c))

## [1.1.0](https://github.com/nuewframe/nfauth/compare/v1.0.1...v1.1.0) (2026-03-26)

### Features

- add CI status badge to README ([#1](https://github.com/nuewframe/nfauth/issues/1)) ([c5faddf](https://github.com/nuewframe/nfauth/commit/c5faddfe0e881f7ead1c76bf250692886eeb5b16))

### Bug Fixes

- remove unused BINARY_SUFFIXES, remove async from findFreePort ([b8b299c](https://github.com/nuewframe/nfauth/commit/b8b299c6060ea0cb35344ad086376e33e81333de))
- run deno fmt to pass format check in CI ([807261a](https://github.com/nuewframe/nfauth/commit/807261ad8f5cd2d75f9e21e2bf570655ea965b83))

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
- `config add` — add environment/profile via CLI flags
- `config set-default` — set active environment/profile
- `config list` — list all environments and profiles
- `get access-token` — print raw access token for scripting
- PKCE implementation (RFC 7636, S256 challenge method)
- Masked stdin password input (never as a flag)
- Token abbreviation in all log output for security
- Chrome DevTools Protocol (CDP) browser automation utilities
