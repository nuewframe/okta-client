# release-management Skill

## When to Use

Trigger phrases: "release", "version bump", "publish", "changelog", "tag", "GitHub release", "RELEASE.md", "release plan", "ship".

Use this skill when preparing, documenting, or automating a release for this project.

---

## Release Types

| Type      | When                                                          | Version Change    |
| --------- | ------------------------------------------------------------- | ----------------- |
| **Patch** | Bug fixes, doc updates                                        | `1.0.0` → `1.0.1` |
| **Minor** | New commands, new flags (backwards-compatible)                | `1.0.x` → `1.1.0` |
| **Major** | Breaking changes to CLI interface or config/credential format | `1.x.x` → `2.0.0` |

Use SemVer strictly. API surface = CLI flags, command names, config schema, credential file schema.

---

## Commit Message Convention (Conventional Commits)

```
feat: add new subcommand for X
fix: correct token parsing when scope is empty
docs: update README with new flags
chore: bump @cliffy/command to 1.0.6
test: add edge case for empty .http file
refactor: extract token validation to utility function
```

| Prefix                                   | Release impact  |
| ---------------------------------------- | --------------- |
| `feat:`                                  | Minor bump      |
| `fix:`                                   | Patch bump      |
| `feat!:` or `BREAKING CHANGE:` in footer | Major bump      |
| `docs:`, `chore:`, `test:`, `refactor:`  | No version bump |

---

## CHANGELOG.md Format (Keep a Changelog)

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Nothing yet

## [1.1.0] - 2024-03-15

### Added

- `config add` subcommand for adding environments directly from CLI (#42)
- `--namespace` flag on all commands

### Fixed

- Token expiry check now uses UTC timestamps correctly (#38)

### Changed

- `get access-token` now exits 1 when no credential file exists

## [1.0.0] - 2024-02-01

### Added

- Initial release with `login`, `login-browser`, `client-credentials`, `user-info`, `decode`, `config`, `get` commands
```

Rules:

- `[Unreleased]` section always at top
- Sections: Added, Changed, Deprecated, Removed, Fixed, Security
- Each entry: clear user-facing description + issue/PR link if applicable
- Date format: ISO 8601 (`YYYY-MM-DD`)

---

## RELEASE.md — Release Process for Maintainers

````markdown
# Release Process

## Prerequisites

- Write access to the repository
- Deno ≥ 2.0 installed
- GitHub CLI (`gh`) installed and authenticated

## Steps

### 1. Update CHANGELOG.md

Move items from `[Unreleased]` to a new `[X.Y.Z]` section with today's date.

### 2. Bump version

Update `version` in `deno.json`:

```bash
# or use the release script:
deno task release --bump minor
```
````

### 3. Verify

```bash
deno task lint
deno task fmt
deno task test
deno check main.ts
```

Confirm the planned refactor targets are complete, the behavior is covered by tests, and quality checks are green before tagging.

### 4. Commit and tag

```bash
git add deno.json CHANGELOG.md
git commit -m "chore: release v1.1.0"
git tag v1.1.0
git push origin main --tags
```

### 5. Build binaries

```bash
deno task build:all
```

Verify each binary:

```bash
./dist/nfauth-mac-arm --version
./dist/nfauth-linux --version
```

### 6. Create GitHub Release

```bash
gh release create v1.1.0 \
  --title "v1.1.0" \
  --notes-file <(awk '/## \[1.1.0\]/,/## \[/' CHANGELOG.md) \
  dist/nfauth-linux \
  dist/nfauth-mac-x64 \
  dist/nfauth-mac-arm \
  dist/nfauth-windows.exe
```

### 7. Verify release

- Check GitHub Releases page
- Download and test the macOS binary
- Test `install.sh` end-to-end

## Rollback

If a release is broken:

```bash
git tag -d v1.1.0
git push origin :refs/tags/v1.1.0
gh release delete v1.1.0
```

Fix the issue, re-run from step 1.

````
---

## release.ts Script

The `scripts/release.ts` script automates the version bump and validation:

```typescript
// Usage:
// deno task release --bump patch   → 1.0.0 → 1.0.1
// deno task release --bump minor   → 1.0.0 → 1.1.0
// deno task release --bump major   → 1.0.0 → 2.0.0
// deno task release --dry-run      → preview without writing
````

Key responsibilities:

1. Read current version from `deno.json`
2. Compute new version per bump type
3. Write new version to `deno.json`
4. Verify CHANGELOG.md has an `[Unreleased]` section
5. (With `--dry-run`) print what would change, without modifying files

---

## CI/CD Workflows

### `.github/workflows/ci.yml`

Runs on every push and pull request:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Lint
        run: deno lint
      - name: Format check
        run: deno fmt --check
      - name: Type check
        run: deno check main.ts
      - name: Test
        run: deno task test
```

### `.github/workflows/release.yml`

Runs on version tag push (`v*`):

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            binary: tool-linux
          - os: macos-latest
            target: x86_64-apple-darwin
            binary: tool-mac-x64
          - os: macos-latest
            target: aarch64-apple-darwin
            binary: tool-mac-arm
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            binary: tool-windows.exe
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Build
        run: deno compile --target ${{ matrix.target }} --allow-env --allow-net --allow-read --allow-write -o dist/${{ matrix.binary }} main.ts
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.binary }}
          path: dist/${{ matrix.binary }}

  release:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: dist/
          merge-multiple: true
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*
          generate_release_notes: true
```

---

## install.sh

A user-facing install script that:

1. Detects OS and architecture
2. Downloads the correct binary from GitHub Releases
3. Verifies checksum (SHA256)
4. Installs to `/usr/local/bin/` or `~/.local/bin/`

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO="nuewframe/nfauth"
BINARY="nfauth"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "${OS}-${ARCH}" in
  linux-x86_64)   SUFFIX="linux" ;;
  darwin-x86_64)  SUFFIX="mac-x64" ;;
  darwin-arm64)   SUFFIX="mac-arm" ;;
  *)              echo "Unsupported platform: ${OS}-${ARCH}"; exit 1 ;;
esac

VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY}-${SUFFIX}"

echo "Installing ${BINARY} ${VERSION} for ${OS}/${ARCH}..."
mkdir -p "${INSTALL_DIR}"
curl -fsSL "${URL}" -o "${INSTALL_DIR}/${BINARY}"
chmod +x "${INSTALL_DIR}/${BINARY}"
echo "✅ Installed to ${INSTALL_DIR}/${BINARY}"
echo "Add ${INSTALL_DIR} to PATH if not already present."
```
