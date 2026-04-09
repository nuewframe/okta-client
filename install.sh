#!/usr/bin/env sh
# install.sh — Install Nuewframe OAuth CLI
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nuewframe/nfauth/main/install.sh | sh
#
# Options (set via environment variables before piping):
#   INSTALL_DIR   — Target directory (default: /usr/local/bin, fallback: ~/.local/bin)
#   VERSION       — Specific version to install (default: latest release)
#   DRY_RUN       — Print resolved install plan and exit (default: 0)
#   FORCE_PLATFORM — Override platform detection (for CI/tests; e.g., linux-x64)
#
# Example:
#   VERSION=v1.2.0 INSTALL_DIR=~/.local/bin \
#     curl -fsSL https://raw.githubusercontent.com/nuewframe/nfauth/main/install.sh | sh

set -eu

REPO='nuewframe/nfauth'
PROJECT='Nuewframe OAuth CLI'
BINARY='nfauth'

# ── Utilities ────────────────────────────────────────────────────────────────

log()  { printf '  %s\n' "$*"; }
err()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }

need() {
  command -v "$1" >/dev/null 2>&1 || err "Required tool not found: $1"
}

# ── Platform detection ───────────────────────────────────────────────────────

detect_platform() {
  if [ -n "${FORCE_PLATFORM:-}" ]; then
    PLATFORM="$FORCE_PLATFORM"
    return
  fi

  OS=$(uname -s)
  ARCH=$(uname -m)

  case "$OS" in
    Darwin)
      case "$ARCH" in
        arm64) PLATFORM='macos-arm64' ;;
        x86_64) PLATFORM='macos-x64' ;;
        *) err "Unsupported macOS architecture: $ARCH" ;;
      esac
      ;;
    Linux)
      case "$ARCH" in
        x86_64) PLATFORM='linux-x64' ;;
        *) err "Unsupported Linux architecture: $ARCH" ;;
      esac
      ;;
    *)
      err "Unsupported OS: $OS. Install manually from https://github.com/$REPO/releases"
      ;;
  esac
}

# ── Install directory ────────────────────────────────────────────────────────

resolve_install_dir() {
  if [ -n "${INSTALL_DIR:-}" ]; then
    DEST_DIR="$INSTALL_DIR"
  elif [ -w '/usr/local/bin' ]; then
    DEST_DIR='/usr/local/bin'
  else
    DEST_DIR="$HOME/.local/bin"
    mkdir -p "$DEST_DIR"
    # Warn if not on PATH
    case ":$PATH:" in
      *":$DEST_DIR:"*) ;;
      *) log "⚠️  $DEST_DIR is not on your PATH. Add it to your shell profile:" ;;
    esac
  fi
}

# ── Resolve version ──────────────────────────────────────────────────────────

resolve_version() {
  if [ -n "${VERSION:-}" ]; then
    TAG="$VERSION"
  else
    log "Fetching latest release..."
    need curl
    TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | grep '"tag_name"' \
      | head -1 \
      | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    [ -n "$TAG" ] || err 'Could not determine latest release. Set VERSION= to install a specific version.'
  fi
}

# ── Download and install ─────────────────────────────────────────────────────

install() {
  ASSET="${BINARY}-${PLATFORM}"
  URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"
  DEST="$DEST_DIR/$BINARY"

  if [ "${DRY_RUN:-0}" = '1' ]; then
    printf 'PLAN_PROJECT=%s\n' "$PROJECT"
    printf 'PLAN_REPO=%s\n' "$REPO"
    printf 'PLAN_BINARY=%s\n' "$BINARY"
    printf 'PLAN_TAG=%s\n' "$TAG"
    printf 'PLAN_PLATFORM=%s\n' "$PLATFORM"
    printf 'PLAN_ASSET=%s\n' "$ASSET"
    printf 'PLAN_URL=%s\n' "$URL"
    printf 'PLAN_DEST=%s\n' "$DEST"
    return
  fi

  TMP=$(mktemp)

  log "Downloading $ASSET ($TAG)..."
  curl -fSL "$URL" -o "$TMP" || err "Download failed: $URL"

  chmod +x "$TMP"
  mv "$TMP" "$DEST"
  ok "Installed $BINARY $TAG → $DEST"
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  printf '\n\033[1m%s installer\033[0m\n\n' "$PROJECT"
  need curl
  detect_platform
  resolve_install_dir
  resolve_version
  install
  printf '\nRun \033[1m%s --help\033[0m to get started.\n\n' "$BINARY"
}

main "$@"
