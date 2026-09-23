#!/bin/sh

# Packages the LiveMark release artifacts: DMG, zip, checksums, and the signed
# updater bundle (`*.app.tar.gz` + `.sig` + `latest.json`) consumed by
# tauri-plugin-updater. Signing the updater bundle requires either
# TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH in the
# environment (plus TAURI_SIGNING_PRIVATE_KEY_PASSWORD when the key has one).

set -eu

VERSION="$(node -p "require('./package.json').version")"
APP="src-tauri/target/release/bundle/macos/LiveMark.app"
DMG="dist/LiveMark-${VERSION}-arm64.dmg"
ZIP="dist/LiveMark-${VERSION}-arm64-mac.zip"
UPDATER_TGZ="dist/LiveMark-${VERSION}-arm64.app.tar.gz"
STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/livemark-release.XXXXXX")"

cleanup() {
  rm -rf "$STAGING_ROOT"
}
trap cleanup EXIT HUP INT TERM

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
  echo "error: set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH to sign the updater bundle" >&2
  exit 1
fi

npm run tauri build -- --bundles app

# A Tauri build without an Apple certificate is linker-signed. Seal the full
# bundle explicitly so its Info.plist, resources, and embedded CLI are covered.
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

mkdir -p "$STAGING_ROOT/dmg" dist
ditto "$APP" "$STAGING_ROOT/dmg/LiveMark.app"
ln -s /Applications "$STAGING_ROOT/dmg/Applications"

rm -f "$DMG" "$ZIP" "$UPDATER_TGZ" "$UPDATER_TGZ.sig" dist/latest.json dist/SHA256SUMS.txt
hdiutil create \
  -volname "LiveMark" \
  -srcfolder "$STAGING_ROOT/dmg" \
  -ov \
  -format UDZO \
  "$DMG"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

# Updater bundle: a plain tar.gz of the sealed .app, signed with the minisign
# keypair whose public key is embedded in tauri.conf.json.
COPYFILE_DISABLE=1 tar -czf "$UPDATER_TGZ" -C "$STAGING_ROOT/dmg" LiveMark.app
npm run tauri -- signer sign "$UPDATER_TGZ"

node -e '
const fs = require("fs");
const version = require("./package.json").version;
const signature = fs.readFileSync(process.argv[1], "utf8").trim();
const manifest = {
  version,
  notes: `LiveMark ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": {
      signature,
      url: `https://github.com/rcoenen/LiveMark/releases/download/v${version}/LiveMark-${version}-arm64.app.tar.gz`,
    },
  },
};
fs.writeFileSync("dist/latest.json", `${JSON.stringify(manifest, null, 2)}\n`);
' "$UPDATER_TGZ.sig"

hdiutil verify "$DMG"
(
  cd dist
  shasum -a 256 "$(basename "$DMG")" "$(basename "$ZIP")" "$(basename "$UPDATER_TGZ")" > SHA256SUMS.txt
)

printf 'Release artifacts:\n  %s\n  %s\n  %s\n  %s\n  %s\n  %s\n' \
  "$DMG" "$ZIP" "$UPDATER_TGZ" "$UPDATER_TGZ.sig" dist/latest.json dist/SHA256SUMS.txt
