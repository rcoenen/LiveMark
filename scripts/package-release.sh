#!/bin/sh

set -eu

VERSION="$(node -p "require('./package.json').version")"
APP="src-tauri/target/release/bundle/macos/LiveMark.app"
DMG="dist/LiveMark-${VERSION}-arm64.dmg"
ZIP="dist/LiveMark-${VERSION}-arm64-mac.zip"
STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/livemark-release.XXXXXX")"

cleanup() {
  rm -rf "$STAGING_ROOT"
}
trap cleanup EXIT HUP INT TERM

npm run tauri build -- --bundles app

# A Tauri build without an Apple certificate is linker-signed. Seal the full
# bundle explicitly so its Info.plist, resources, and embedded CLI are covered.
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

mkdir -p "$STAGING_ROOT/dmg" dist
ditto "$APP" "$STAGING_ROOT/dmg/LiveMark.app"
ln -s /Applications "$STAGING_ROOT/dmg/Applications"

rm -f "$DMG" "$ZIP" dist/SHA256SUMS.txt
hdiutil create \
  -volname "LiveMark" \
  -srcfolder "$STAGING_ROOT/dmg" \
  -ov \
  -format UDZO \
  "$DMG"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

hdiutil verify "$DMG"
(
  cd dist
  shasum -a 256 "$(basename "$DMG")" "$(basename "$ZIP")" > SHA256SUMS.txt
)

printf 'Release artifacts:\n  %s\n  %s\n  %s\n' "$DMG" "$ZIP" "dist/SHA256SUMS.txt"
