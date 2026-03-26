# oss-engineer Skill

## When to Use

Trigger phrases: "oss", "open source", "public release", "repo health", "community", "security policy", "OSS hygiene", "project setup".

Use this skill when setting up, reviewing, or improving this repository as a professional open-source project.

---

## OSS Project Anatomy

A distinguished OSS project includes:

```
README.md           — installation, quick-start, full command reference
CONTRIBUTING.md     — dev setup, PR process, commit conventions
CHANGELOG.md        — version history (Keep a Changelog format)
RELEASE.md          — release process for maintainers
LICENSE             — OSS license (MIT for this project)
SECURITY.md         — vulnerability reporting policy
.github/
  workflows/
    ci.yml          — lint, type-check, test on every PR
    release.yml     — tag-triggered build + GitHub Release
  ISSUE_TEMPLATE/
    bug_report.md
    feature_request.md
  PULL_REQUEST_TEMPLATE.md
```

---

## README Checklist

A strong README answers these questions in order:

1. **What is it?** — one-paragraph elevator pitch
2. **Why use it?** — key differentiators, use cases
3. **Install** — exact commands, all platforms (macOS, Linux, Windows)
4. **Quick start** — copy-paste example that works end-to-end
5. **Command reference** — every command, every flag, with examples
6. **Configuration** — config file schema with annotated example
7. **Integration** — how to combine with other tools
8. **Contributing** — link to CONTRIBUTING.md
9. **License** — one-liner + link

### README Quality Rules

- Code blocks must be runnable as-is
- Flag descriptions match the CLI `--help` output exactly
- Paths use `~` for home directory (e.g., `~/.nuewframe/config.yaml`)
- Commands use the published binary name, not `deno task dev`

---

## CONTRIBUTING.md Template

````markdown
# Contributing

## Development Setup

1. Install [Deno](https://deno.land/) ≥ 2.0
2. Clone the repo: `git clone https://github.com/nuewframe/<repo>.git`
3. Run tests: `deno task test`
4. Run from source: `deno task dev --help`

## Code Style

This project uses `deno fmt` and `deno lint`. Run before submitting:

```bash
deno task lint
deno task fmt
```
````

## Commit Message Convention

Follow Conventional Commits:

- `feat: add new command`
- `fix: correct token parsing`
- `docs: update README`
- `chore: bump dependency version`
- `test: add parser edge-case tests`

## Pull Request Process

1. Fork and create a branch: `git checkout -b feat/my-feature`
2. Make changes + add/update tests
3. Run `deno task test` — all tests must pass
4. Push and open a PR against `main`
5. A maintainer will review within 5 business days

## Release Process

See [RELEASE.md](RELEASE.md).

````
---

## SECURITY.md Template

```markdown
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: security@nuewframe.com (or open a private GitHub security advisory).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 72 hours and aim to patch within 14 days.
````

---

## Issue Templates

### Bug Report (`bug_report.md`)

```markdown
---
name: Bug report
about: Create a report to help us improve
labels: bug
---

## Description

<!-- Clear description of the bug -->

## Steps to Reproduce

1. Run `okta-client <command> <args>`
2. See error

## Expected Behavior

<!-- What should have happened -->

## Actual Behavior

<!-- What actually happened — include full error output -->

## Environment

- OS: [macOS 14 / Ubuntu 22.04 / Windows 11]
- Deno version: [output of `deno --version`]
- Tool version: [output of `okta-client --version`]
```

### Feature Request (`feature_request.md`)

```markdown
---
name: Feature request
about: Suggest an idea for this project
labels: enhancement
---

## Problem Statement

<!-- What problem does this solve? -->

## Proposed Solution

<!-- How should it work? Include example commands/output -->

## Alternatives Considered

<!-- Other approaches you considered -->
```

---

## Pull Request Template

```markdown
## Summary

<!-- One-sentence summary of the change -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactor
- [ ] Dependency update

## Testing

- [ ] All existing tests pass (`deno task test`)
- [ ] New tests added for new behaviour
- [ ] Manual test: `deno task dev <command> <args>` works

## Checklist

- [ ] `deno task lint` passes
- [ ] `deno task fmt` applied
- [ ] CHANGELOG.md updated (for features/fixes)
- [ ] README.md updated (for new commands/flags)
```

---

## GitHub Branch Protection Rules

For `main` branch:

- Require PR before merging
- Require status checks (CI must pass)
- Require linear history (no merge commits)
- Restrict force pushes

---

## Repository Settings

- **Description**: one-line summary matching README pitch
- **Topics/tags**: `deno`, `typescript`, `cli`, `okta`, `oidc`, `oauth2` (or `graphql`, `http`)
- **Website**: link to usage docs or npm/jsr registry page
- **Social preview**: generate with tool logo + name

---

## Release Cadence

- Patch releases: as needed for bug fixes
- Minor releases: when adding new commands or flags
- Major releases: when breaking changes occur to CLI interface or credential format
- Use Conventional Commits to auto-generate changelogs
