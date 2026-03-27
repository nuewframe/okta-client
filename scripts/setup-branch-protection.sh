#!/usr/bin/env sh
# Setup repository rulesets for a branch.
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated: gh auth login
#   - jq installed
#   - Auth token has SSO enabled for the org (if org enforces SAML)
#   - Admin access to the repository
#
# Usage:
#   REPO=owner/repo sh scripts/setup-branch-protection.sh
#   REPO=owner/repo BRANCH=master sh scripts/setup-branch-protection.sh
#   REPO=owner/repo ENFORCE_PR=false sh scripts/setup-branch-protection.sh
#   REPO=owner/repo REQUIRED_CHECKS="Test & Lint,security-scan" sh scripts/setup-branch-protection.sh
#   REPO=owner/repo REQUIRE_SIGNED_COMMITS=true sh scripts/setup-branch-protection.sh
#
# Defaults:
#   - Branch: main
#   - PR enforcement: enabled
#   - Required approvals: 1
#   - Code owner review: enabled when CODEOWNERS exists, otherwise disabled
#   - Dismiss stale reviews on push: enabled
#   - Last push approval: enabled
#   - Review thread resolution: enabled
#   - Block force-pushes: enabled
#   - Block branch deletion: enabled
#   - Require linear history: enabled
#   - Required CI status checks: "Test & Lint" (strict — branch must be up-to-date)
#   - Require signed commits: disabled
#   - No bypass actors (admins, release bots included)
#
# CI / release notes:
#   REQUIRED_CHECKS must match the exact job name shown on the PR status check UI.
#   The default "Test & Lint" matches the CI workflow job defined in .github/workflows/ci.yml.
#   The release workflow (release-please) operates via PRs and the GitHub releases API; it
#   does not push directly to the protected branch, so no bypass actors are needed.
#
# Tunables:
#   - BRANCH=main
#   - ENFORCE_PR=true|false
#   - REQUIRED_APPROVALS=0..10
#   - REQUIRE_CODE_OWNER_REVIEW=true|false|auto
#   - DISMISS_STALE_REVIEWS_ON_PUSH=true|false
#   - REQUIRE_LAST_PUSH_APPROVAL=true|false
#   - REQUIRE_REVIEW_THREAD_RESOLUTION=true|false
#   - BLOCK_DELETIONS=true|false
#   - BLOCK_FORCE_PUSHES=true|false
#   - REQUIRE_LINEAR_HISTORY=true|false
#   - REQUIRE_STATUS_CHECKS=true|false
#   - REQUIRED_CHECKS="Test & Lint"   (comma-separated check context names from CI)
#   - STRICT_STATUS_CHECKS=true|false (require branch up-to-date before merge)
#   - REQUIRE_SIGNED_COMMITS=true|false
#   - ALLOW_ADMIN_BYPASS=true|false     (let repo admins merge without satisfying rules)
#   - ADMIN_BYPASS_MODE=pull_request|always
#       pull_request — admins can merge PRs bypassing rules but cannot push directly (default)
#       always       — admins bypass rules on both direct pushes and PRs

set -eu

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is not installed. See https://cli.github.com" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is not installed. See https://jqlang.org/download/" >&2
  exit 1
fi

REPO="${REPO:-}"
API_VERSION="${API_VERSION:-2026-03-10}"
BRANCH="${BRANCH:-main}"
BRANCH_URL="$(jq -rn --arg value "$BRANCH" '$value | @uri')"
ENFORCE_PR="${ENFORCE_PR:-true}"
REQUIRED_APPROVALS="${REQUIRED_APPROVALS:-1}"
REQUIRE_CODE_OWNER_REVIEW="${REQUIRE_CODE_OWNER_REVIEW:-auto}"
DISMISS_STALE_REVIEWS_ON_PUSH="${DISMISS_STALE_REVIEWS_ON_PUSH:-true}"
REQUIRE_LAST_PUSH_APPROVAL="${REQUIRE_LAST_PUSH_APPROVAL:-true}"
REQUIRE_REVIEW_THREAD_RESOLUTION="${REQUIRE_REVIEW_THREAD_RESOLUTION:-true}"
BLOCK_DELETIONS="${BLOCK_DELETIONS:-true}"
BLOCK_FORCE_PUSHES="${BLOCK_FORCE_PUSHES:-true}"
REQUIRE_LINEAR_HISTORY="${REQUIRE_LINEAR_HISTORY:-true}"
RULESET_NAME="${RULESET_NAME:-${BRANCH} Branch Protection}"
REQUIRE_STATUS_CHECKS="${REQUIRE_STATUS_CHECKS:-true}"
REQUIRED_CHECKS="${REQUIRED_CHECKS:-Test & Lint}"
STRICT_STATUS_CHECKS="${STRICT_STATUS_CHECKS:-true}"
REQUIRE_SIGNED_COMMITS="${REQUIRE_SIGNED_COMMITS:-false}"
ALLOW_ADMIN_BYPASS="${ALLOW_ADMIN_BYPASS:-false}"
ADMIN_BYPASS_MODE="${ADMIN_BYPASS_MODE:-pull_request}"

is_true() {
  [ "$1" = "true" ]
}

validate_bool() {
  case "$2" in
    true|false) ;;
    *)
      echo "Invalid value for $1: $2 (expected true or false)" >&2
      exit 1
      ;;
  esac
}

if [ -z "$REPO" ]; then
  echo "Error: REPO is required. Usage: REPO=owner/repo sh scripts/setup-branch-protection.sh" >&2
  exit 1
fi

case "$REQUIRE_CODE_OWNER_REVIEW" in
  true|false|auto) ;;
  *)
    echo "Invalid value for REQUIRE_CODE_OWNER_REVIEW: $REQUIRE_CODE_OWNER_REVIEW (expected true, false, or auto)" >&2
    exit 1
    ;;
esac

validate_bool ENFORCE_PR "$ENFORCE_PR"
validate_bool DISMISS_STALE_REVIEWS_ON_PUSH "$DISMISS_STALE_REVIEWS_ON_PUSH"
validate_bool REQUIRE_LAST_PUSH_APPROVAL "$REQUIRE_LAST_PUSH_APPROVAL"
validate_bool REQUIRE_REVIEW_THREAD_RESOLUTION "$REQUIRE_REVIEW_THREAD_RESOLUTION"
validate_bool BLOCK_DELETIONS "$BLOCK_DELETIONS"
validate_bool BLOCK_FORCE_PUSHES "$BLOCK_FORCE_PUSHES"
validate_bool REQUIRE_LINEAR_HISTORY "$REQUIRE_LINEAR_HISTORY"
validate_bool REQUIRE_STATUS_CHECKS "$REQUIRE_STATUS_CHECKS"
validate_bool STRICT_STATUS_CHECKS "$STRICT_STATUS_CHECKS"
validate_bool REQUIRE_SIGNED_COMMITS "$REQUIRE_SIGNED_COMMITS"
validate_bool ALLOW_ADMIN_BYPASS "$ALLOW_ADMIN_BYPASS"

case "$ADMIN_BYPASS_MODE" in
  pull_request|always) ;;
  *)
    echo "Invalid value for ADMIN_BYPASS_MODE: $ADMIN_BYPASS_MODE (expected pull_request or always)" >&2
    exit 1
    ;;
esac

case "$REQUIRED_APPROVALS" in
  ''|*[!0-9]*)
    echo "Invalid value for REQUIRED_APPROVALS: $REQUIRED_APPROVALS (expected integer 0..10)" >&2
    exit 1
    ;;
esac

if [ "$REQUIRED_APPROVALS" -gt 10 ]; then
  echo "Invalid value for REQUIRED_APPROVALS: $REQUIRED_APPROVALS (expected integer 0..10)" >&2
  exit 1
fi

if is_true "$REQUIRE_STATUS_CHECKS" && [ -z "${REQUIRED_CHECKS:-}" ]; then
  echo "REQUIRED_CHECKS must not be empty when REQUIRE_STATUS_CHECKS=true" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

HAS_CODEOWNERS=false

if [ "$REQUIRE_CODE_OWNER_REVIEW" = "auto" ]; then
  if [ -n "$REPO_ROOT" ]; then
    for codeowners_path in .github/CODEOWNERS docs/CODEOWNERS CODEOWNERS; do
      if [ -f "$REPO_ROOT/$codeowners_path" ]; then
        HAS_CODEOWNERS=true
        break
      fi
    done
  fi

  if [ "$HAS_CODEOWNERS" = true ]; then
    REQUIRE_CODE_OWNER_REVIEW_RESOLVED=true
  else
    REQUIRE_CODE_OWNER_REVIEW_RESOLVED=false
  fi
else
  REQUIRE_CODE_OWNER_REVIEW_RESOLVED="$REQUIRE_CODE_OWNER_REVIEW"
fi

build_bypass_actors_json() {
  # actor_id 5 = the built-in Repository Admin role (GitHub built-in role IDs are stable)
  if is_true "$ALLOW_ADMIN_BYPASS"; then
    printf '[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"%s"}]' "$ADMIN_BYPASS_MODE"
  else
    printf '[]'
  fi
}

build_status_checks_json() {
  jq -cn --arg checks "$REQUIRED_CHECKS" '
    $checks
    | split(",")
    | map(gsub("^\\s+|\\s+$"; ""))
    | map(select(length > 0))
    | map({context: .})
  '
}

_first_rule=true

append_rule() {
  if [ "$_first_rule" = true ]; then
    _first_rule=false
  else
    printf ',\n'
  fi
  printf '%b' "$1"
}

build_rules_json() {
  _first_rule=true

  if is_true "$BLOCK_DELETIONS"; then
    append_rule '    { "type": "deletion" }'
  fi

  if is_true "$BLOCK_FORCE_PUSHES"; then
    append_rule '    { "type": "non_fast_forward" }'
  fi

  if is_true "$REQUIRE_LINEAR_HISTORY"; then
    append_rule '    { "type": "required_linear_history" }'
  fi

  if is_true "$REQUIRE_STATUS_CHECKS"; then
    checks_json="$(build_status_checks_json)"
    append_rule "    {\n      \"type\": \"required_status_checks\",\n      \"parameters\": {\n        \"strict_required_status_checks_policy\": $STRICT_STATUS_CHECKS,\n        \"required_status_checks\": ${checks_json}\n      }\n    }"
  fi

  if is_true "$REQUIRE_SIGNED_COMMITS"; then
    append_rule '    { "type": "required_signatures" }'
  fi

  if is_true "$ENFORCE_PR"; then
    append_rule "    {\n      \"type\": \"pull_request\",\n      \"parameters\": {\n        \"required_approving_review_count\": $REQUIRED_APPROVALS,\n        \"dismiss_stale_reviews_on_push\": $DISMISS_STALE_REVIEWS_ON_PUSH,\n        \"require_code_owner_review\": $REQUIRE_CODE_OWNER_REVIEW_RESOLVED,\n        \"require_last_push_approval\": $REQUIRE_LAST_PUSH_APPROVAL,\n        \"required_review_thread_resolution\": $REQUIRE_REVIEW_THREAD_RESOLUTION\n      }\n    }"
  fi
}

build_ruleset_payload() {
  jq -n --indent 2 \
    --arg name "$RULESET_NAME" \
    --arg branch "$BRANCH" \
    --argjson bypass_actors "$(build_bypass_actors_json)" \
    --argjson rules "[$(build_rules_json)]" \
    '{name:$name,target:"branch",enforcement:"active",bypass_actors:$bypass_actors,conditions:{ref_name:{include:["refs/heads/"+$branch],exclude:[]}},rules:$rules}'
}

validate_payload() {
  build_ruleset_payload | jq empty >/dev/null
}

run_gh_api() {
  step="$1"
  shift

  if ! GH_PAGER=cat gh api "$@"; then
    echo "GitHub API call failed during: $step" >&2
    echo "Endpoint: $1" >&2
    return 1
  fi
}

export REPO RULESET_NAME BRANCH

echo "Applying ruleset '$RULESET_NAME' to $REPO branch '$BRANCH'..."
echo "Using API version: $API_VERSION"
echo "PR enforcement: $ENFORCE_PR"
echo "Required approvals: $REQUIRED_APPROVALS"
echo "Code owner review: $REQUIRE_CODE_OWNER_REVIEW_RESOLVED"
echo "Required status checks: $REQUIRE_STATUS_CHECKS"
if is_true "$REQUIRE_STATUS_CHECKS"; then
  echo "Required checks: $REQUIRED_CHECKS"
  echo "Strict status checks: $STRICT_STATUS_CHECKS"
fi
echo "Require signed commits: $REQUIRE_SIGNED_COMMITS"
echo "Admin bypass: $ALLOW_ADMIN_BYPASS"
if is_true "$ALLOW_ADMIN_BYPASS"; then
  echo "Admin bypass mode: $ADMIN_BYPASS_MODE"
fi

if ! validate_payload; then
  echo "Generated payload is not valid JSON." >&2
  echo "Payload:" >&2
  build_ruleset_payload >&2
  exit 1
fi

RULESET_ID="$(run_gh_api "list rulesets" "repos/$REPO/rulesets?targets=branch&per_page=100" \
  --header 'Accept: application/vnd.github+json' \
  --header "X-GitHub-Api-Version: $API_VERSION" \
  --jq 'limit(1; .[] | select(.name==env.RULESET_NAME and .target=="branch" and ((.conditions.ref_name.include // []) | index("refs/heads/" + env.BRANCH) != null)) | .id)')"

if [ -z "${RULESET_ID:-}" ]; then
  RULESET_ID="$(run_gh_api "discover existing branch ruleset" "repos/$REPO/rules/branches/$BRANCH_URL" \
    --header 'Accept: application/vnd.github+json' \
    --header "X-GitHub-Api-Version: $API_VERSION" \
    --jq '[.[] | select(.ruleset_source_type=="Repository" and .ruleset_source==env.REPO) | .ruleset_id] | unique | .[0] // empty')"
fi

if [ -n "${RULESET_ID:-}" ]; then
  echo "Updating existing ruleset id=$RULESET_ID"
  APPLIED_RULESET_ID="$(build_ruleset_payload | run_gh_api "update ruleset" "repos/$REPO/rulesets/$RULESET_ID" \
    --method PUT \
    --header 'Accept: application/vnd.github+json' \
    --header "X-GitHub-Api-Version: $API_VERSION" \
    --input - \
    --jq '.id')"
else
  echo "Creating new ruleset"
  APPLIED_RULESET_ID="$(build_ruleset_payload | run_gh_api "create ruleset" "repos/$REPO/rulesets" \
    --method POST \
    --header 'Accept: application/vnd.github+json' \
    --header "X-GitHub-Api-Version: $API_VERSION" \
    --input - \
    --jq '.id')"
fi

if [ -z "${APPLIED_RULESET_ID:-}" ]; then
  echo "Error: No ruleset ID returned — the API may have succeeded but returned an unexpected response." >&2
  exit 1
fi

echo "Ruleset applied successfully (id=$APPLIED_RULESET_ID)"

echo ""
echo "Effective active rules on $BRANCH:"
RULE_LINES="$(run_gh_api "verify effective rules" "repos/$REPO/rules/branches/$BRANCH_URL" \
  --header 'Accept: application/vnd.github+json' \
  --header "X-GitHub-Api-Version: $API_VERSION" \
  --jq '.[] | "- " + .type + " (source: " + .ruleset_source + ", id: " + (.ruleset_id|tostring) + ")"')"

if [ -n "$RULE_LINES" ]; then
  printf '%s\n' "$RULE_LINES"
else
  echo "No active rules returned for $BRANCH."
fi

echo ""
echo "✓ Ruleset configured for $REPO branch '$BRANCH'"
echo ""
echo "Repository settings to review:"
echo "  - Settings → General → merge strategy: keep only 'Allow squash merging'"
echo "  - Settings → General → enable 'Automatically delete head branches'"
echo "  - Re-run with REQUIRE_SIGNED_COMMITS=true to require GPG/SSH signed commits"