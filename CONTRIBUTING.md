# Contributing to okta-client

Thank you for your interest in contributing!

## Development Setup

1. Install [Deno](https://deno.land/) ≥ 2.0
2. Clone the repo:
   ```bash
   git clone https://github.com/nuewframe/okta-client.git
   cd okta-client
   ```
3. Run from source:
   ```bash
   deno task dev --help
   ```
4. Run tests:
   ```bash
   deno task check
   deno task hooks
   ```

## Code Style

This project uses `deno fmt` and `deno lint` with the settings in `deno.json`:

- 2-space indentation
- Single quotes
- Semicolons
- 100-character line width

Always run before submitting:

```bash
deno task check
```

## Project Structure

```
commands/     One file per CLI subcommand
config/       Config loading/saving utilities
services/     Business logic (no CLI dependencies)
utils/        Shared utilities (logger, jwt, pkce, credentials)
```

## Engineering Workflow

Follow a plan-before-code approach:

- Define expected behavior and refactor targets in tests before writing implementation.
- Preserve layer separation: commands compose, services implement business logic, utils support shared concerns.
- After the first green test run, execute the planned refactor and rerun tests and quality checks.
- Code is not done when only correct; it is done when clean, verified, and free of duplication.

## Adding a New Command

See `.github/skills/new-command/SKILL.md` for the step-by-step guide.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add refresh-token subcommand
fix: correct PKCE challenge generation
docs: update config schema in README
chore: bump @okta/okta-auth-js to 8.1.0
test: add edge cases for token expiry check
```

## Security Rules

- Never log full tokens — abbreviate: `token.substring(0, 6) + '...'`
- Never accept passwords as CLI flags — use masked stdin input
- Never commit credentials, API tokens, or client secrets

## Commit Message Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). The release
automation (`release-please`) reads commit messages to determine version bumps and generate
the CHANGELOG automatically.

| Prefix              | Effect              | Example                                        |
| ------------------- | ------------------- | ---------------------------------------------- |
| `feat:`             | minor version bump  | `feat: add --json output flag`                 |
| `fix:`              | patch version bump  | `fix: handle empty credential file`            |
| `feat!:` or `fix!:` | major version bump  | `feat!: rename --token flag to --access-token` |
| `docs:`             | no bump (docs only) | `docs: update login-browser usage`             |
| `chore:`            | no bump             | `chore: update dependencies`                   |
| `refactor:`         | no bump             | `refactor: extract token validation helper`    |
| `test:`             | no bump             | `test: add edge cases for PKCE verifier`       |

Breaking changes must also include a `BREAKING CHANGE:` footer in the commit body:

```
feat!: rename config file to ~/.okta-client/config.yaml

BREAKING CHANGE: config file location changed from ~/.nuewframe/config.yaml
```

> **Tip:** Squash your PR commits so each PR produces one clean conventional commit on `main`.

## Pull Request Process

1. Fork and create a branch: `git checkout -b feat/my-feature`
2. Make changes with tests
3. Run `deno task check` — formatting, linting, and tests must pass
4. Ensure your commits follow the Conventional Commits convention above
5. Push and open a PR against `main` — fill in the PR template checklist
6. A maintainer from `@nuewframe/maintainers` will review and approve
7. Once approved and CI is green, squash-merge to `main`

## Release Process

Releases are **fully automated** — no manual steps required:

1. Your squash-merged commit to `main` is inspected by `release-please`
2. If the commit warrants a release (`feat:`, `fix:`, or breaking change), release-please
   opens or updates a Release PR that bumps the version and updates `CHANGELOG.md`
3. A maintainer reviews and merges the Release PR
4. The merge triggers binary builds for all platforms; artifacts are attached to the GitHub Release automatically

See [RELEASE.md](RELEASE.md) for the full release process and [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md) for the governance model.
