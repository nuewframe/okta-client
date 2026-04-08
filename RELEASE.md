# Release Process

This document describes how to cut a new release of `okta-client`.

## Prerequisites

- [Deno](https://deno.land/) ≥ 2.0 installed
- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated (`gh auth login`)
- Write access to this repository via `git push`
- All checks passing (`deno task check`)

## Pre-Release Checklist

1. **Update CHANGELOG.md** — move items from `[Unreleased]` to the new version section
   (the release script will do this automatically, but review first):
   ```
   ## [Unreleased]

   ### Added
   - Description of what changed
   ```

2. **Run quality checks** to confirm nothing is broken:
   ```bash
   deno task check
   ```

3. **Confirm git working tree is clean** — commit or stash any pending changes.

## Running the Release

The release script automates all steps:

```bash
# Patch release (1.0.0 → 1.0.1) — most common
deno task release

# Minor release (1.0.0 → 1.1.0) — new backwards-compatible features
deno task release --bump minor

# Major release (1.0.0 → 2.0.0) — breaking changes
deno task release --bump major

# Preview what would happen (no writes, no pushes)
deno task release --dry-run
```

### What the release script does

1. Reads current version from `deno.json`
2. Computes new version per `--bump` type
3. Moves `[Unreleased]` section in `CHANGELOG.md` to the new version heading
4. Updates `version` field in `deno.json`
5. Runs `deno task build:all` to produce platform binaries in `dist/`
6. Commits `deno.json` and `CHANGELOG.md` with message `chore: release vX.Y.Z`
7. Creates and pushes git tag `vX.Y.Z`
8. Creates a GitHub Release with all binaries attached via `gh release create`

## Post-Release

- Visit the [Releases page](../../releases) to confirm the release was created correctly
- Verify the binary download links work
- If the CI workflow is configured, confirm it completed successfully
- Announce the release in relevant channels if applicable

## Hotfix Releases

For urgent bug fixes on a tagged release:

1. Create a branch from the release tag: `git checkout -b hotfix/v1.0.2 v1.0.1`
2. Apply the fix and ensure tests pass
3. Open a PR, merge to main, then run `deno task release --bump patch`

## Reverting a Release

To delete a GitHub release and its associated tag:

```bash
gh release delete vX.Y.Z --yes
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
```

Then revert the version bump commit and re-run the release at the correct version.
