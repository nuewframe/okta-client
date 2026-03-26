# Branch Protection Setup

This document describes the required branch protection rules for `nuewframe/okta-client`.
Apply them with the automated script or follow the manual steps below.

## Automated Setup

```bash
# Requires: gh CLI authenticated with admin access
REPO=nuewframe/okta-client sh scripts/setup-branch-protection.sh
```

## Manual Setup (GitHub UI)

Navigate to **Settings → Branches → Add branch protection rule** and target `main`:

### Required Status Checks

| Setting                           | Value         |
| --------------------------------- | ------------- |
| Require status checks to pass     | ✅ enabled    |
| Require branches to be up to date | ✅ enabled    |
| Status checks required            | `Test & Lint` |

> `Test & Lint` is the job name from `.github/workflows/ci.yml`.

### Pull Request Reviews

| Setting                                                          | Value                                        |
| ---------------------------------------------------------------- | -------------------------------------------- |
| Require a pull request before merging                            | ✅ enabled                                   |
| Required approving reviews                                       | `1`                                          |
| Dismiss stale pull request approvals when new commits are pushed | ✅ enabled                                   |
| Require review from Code Owners                                  | ✅ enabled (reads from `.github/CODEOWNERS`) |
| Require approval of the most recent reviewable push              | ✅ enabled                                   |

### Additional Rules

| Setting                                        | Value                           |
| ---------------------------------------------- | ------------------------------- |
| Require linear history                         | ✅ enabled (squash merges only) |
| Allow force pushes                             | ❌ disabled                     |
| Allow deletions                                | ❌ disabled                     |
| Require conversation resolution before merging | ✅ enabled                      |

## Rulesets (Recommended)

In addition to branch protection, apply these via **Settings → Rules → Rulesets**:

- **Require signed commits** — ensures all commits are GPG/SSH signed
- **Block force pushes** — belt-and-suspenders alongside branch protection

## Repository Settings

Under **Settings → General**, configure:

| Setting                            | Value                                                 |
| ---------------------------------- | ----------------------------------------------------- |
| Allow merge commits                | ❌ disabled                                           |
| Allow squash merging               | ✅ enabled (use "Pull request title and description") |
| Allow rebase merging               | ❌ disabled                                           |
| Automatically delete head branches | ✅ enabled                                            |

## How This Integrates with the Release Workflow

1. Developer opens a feature branch and creates a PR
2. CI (`ci.yml`) runs `deno task test`, `deno lint`, `deno fmt --check`
3. A maintainer in `@nuewframe/maintainers` (defined in `.github/CODEOWNERS`) reviews and approves
4. PR is squash-merged to `main`
5. `release.yml` fires: `release-please-action` inspects the commit, updates the Release PR
6. When the Release PR is merged → tag + GitHub release + platform binaries published automatically

No direct commits to `main`. No manual version bumps. No manual `deno task release` needed.
