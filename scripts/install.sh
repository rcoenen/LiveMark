#!/bin/bash
# Install LiveMark from the latest GitHub release and strip Gatekeeper quarantine.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/rcoenen/LiveMark/main/scripts/install.sh | bash
#   LIVEMARK_VERSION=1.3.0 ./scripts/install.sh

set -euo pipefail

REPO="rcoenen/LiveMark"
APP_NAME="LiveMark"
INSTALL_DIR="${LIVEMARK_INSTALL_DIR:-/Applications}"
DEST="${INSTALL_DIR}/${APP_NAME}.app"
RELEASES_URL="https://github.com/${REPO}/releases"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "livemark: missing required command: $1" >&2
    exit 1
  fi
}

need curl
need ditto
need hdiutil
need shasum
need xattr

if [ "$(uname -s)" != "Darwin" ]; then
  echo "livemark: macOS only" >&2
  exit 1
fi

if [ "$(uname -m)" != "arm64" ]; then
  echo "livemark: Apple silicon (arm64) only" >&2
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/livemark-install.XXXXXX")"
MOUNT="${TMP}/mnt"
cleanup() {
  hdiutil detach "$MOUNT" -force -quiet >/dev/null 2>&1 || true
  rm -rf "$TMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -n "${LIVEMARK_VERSION:-}" ]; then
  VERSION="${LIVEMARK_VERSION#v}"
  TAG="v${VERSION}"
else
  LATEST_URL="$(curl -fsSL -o /dev/null -w '%{url_effective}' "${RELEASES_URL}/latest")"
  TAG="${LATEST_URL##*/}"
  VERSION="${TAG#v}"
fi

if [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
  echo "livemark: could not resolve the latest release tag" >&2
  exit 1
fi

DMG_NAME="${APP_NAME}-${VERSION}-arm64.dmg"
BASE="${RELEASES_URL}/download/${TAG}"
DMG="${TMP}/${DMG_NAME}"

echo "livemark: installing ${APP_NAME} ${VERSION}"
curl -fL --progress-bar -o "$DMG" "${BASE}/${DMG_NAME}"
curl -fsSL -o "${TMP}/SHA256SUMS.txt" "${BASE}/SHA256SUMS.txt"

EXPECTED="$(awk -v name="$DMG_NAME" '$2 == name { print $1; exit }' "${TMP}/SHA256SUMS.txt")"
if [ -z "$EXPECTED" ]; then
  echo "livemark: no checksum for ${DMG_NAME} in SHA256SUMS.txt" >&2
  exit 1
fi

ACTUAL="$(shasum -a 256 "$DMG" | awk '{ print $1 }')"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "livemark: checksum mismatch for ${DMG_NAME}" >&2
  echo "  expected ${EXPECTED}" >&2
  echo "  got      ${ACTUAL}" >&2
  exit 1
fi

mkdir -p "$MOUNT"
hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$DMG" >/dev/null

if [ ! -d "${MOUNT}/${APP_NAME}.app" ]; then
  echo "livemark: ${APP_NAME}.app not found in the disk image" >&2
  exit 1
fi

if [ -e "$DEST" ] && lsof -t "${DEST}/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1; then
  echo "livemark: ${APP_NAME} is running from ${DEST}. Quit it and run the installer again." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
if [ -e "$DEST" ]; then
  echo "livemark: replacing existing ${DEST}"
  rm -rf "$DEST"
fi

ditto "${MOUNT}/${APP_NAME}.app" "$DEST"
xattr -cr "$DEST"

echo "livemark: installed ${DEST}"
echo "livemark: Gatekeeper quarantine removed. You can open ${APP_NAME} normally."
