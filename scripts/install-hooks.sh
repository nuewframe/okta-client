#!/usr/bin/env sh
# Install local Git hooks for this repository.
#
# Usage:
#   sh scripts/install-hooks.sh
#   deno task hooks
#
# The pre-push hook runs fmt check, lint, and tests before every push.
# To bypass on a single push: git push --no-verify

set -eu

if ! command -v deno >/dev/null 2>&1; then
  printf '\033[31m✗ deno is not installed on PATH (required for pre-push hook)\033[0m\n' >&2
  printf '  Install from https://docs.deno.com/runtime/getting_started/installation/\n' >&2
  exit 1
fi

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || {
  printf '\033[31m✗ Not inside a git repository\033[0m\n' >&2
  exit 1
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  printf '\033[31m✗ Failed to determine repository root\033[0m\n' >&2
  exit 1
}

HOOKS_PATH="$(git config --get core.hooksPath 2>/dev/null || printf '')"
if [ -n "$HOOKS_PATH" ]; then
  case "$HOOKS_PATH" in
    /*)
      HOOKS_DIR="$HOOKS_PATH"
      ;;
    *)
      HOOKS_DIR="$REPO_ROOT/$HOOKS_PATH"
      ;;
  esac
else
  HOOKS_DIR="$GIT_DIR/hooks"
fi
mkdir -p "$HOOKS_DIR"
HOOK="$HOOKS_DIR/pre-push"

if [ -f "$HOOK" ] && ! grep -q '# managed by install-hooks.sh' "$HOOK" 2>/dev/null; then
  printf 'Warning: existing pre-push hook is not managed by install-hooks.sh\n' >&2
  printf '  Backed up to: %s.bak\n' "$HOOK" >&2
  cp "$HOOK" "${HOOK}.bak"
fi

cat > "$HOOK" << 'HOOK_BODY'
#!/usr/bin/env sh
# managed by install-hooks.sh — do not edit manually
# Re-install: sh scripts/install-hooks.sh

set -eu

if ! command -v deno >/dev/null 2>&1; then
  printf '\033[31m✗ pre-push: deno is not installed on PATH\033[0m\n' >&2
  printf '  Install from https://docs.deno.com/runtime/getting_started/installation/\n' >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  printf '\033[31m✗ pre-push: not inside a git repository\033[0m\n' >&2
  exit 1
}
cd "$REPO_ROOT"

printf '▶ pre-push: fmt check...\n'
deno task fmt:check

printf '▶ pre-push: lint...\n'
deno task lint

printf '▶ pre-push: test...\n'
deno task test

printf '\033[32m✓ All checks passed\033[0m\n'
HOOK_BODY

chmod +x "$HOOK"

printf '\033[32m✓ pre-push hook installed\033[0m\n'
printf '  Location : %s\n' "$HOOK"
printf '  Bypass   : git push --no-verify\n'
