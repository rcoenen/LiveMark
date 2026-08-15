# Tauri migration parity matrix

This matrix records the 1.4.0 migration checks on Apple silicon macOS 26.5.2. Automated checks run through `npm test` and `npm run build`; desktop checks use the ad-hoc-signed release bundle produced by `npm run dist`.

| Area | Release check | Result |
| --- | --- | --- |
| Cold Finder delivery | Launch `.app` with `README.md`; verify no crash and active document | Pass |
| Warm Finder delivery | Open `CHANGELOG.md` into the running app | Pass |
| Cold CLI delivery | Launch release binary with a document path | Pass |
| Warm bundled CLI | Open two paths through `Contents/Resources/bin/livemark` | Pass |
| Duplicate paths | Reopen `README.md`; existing tab activates without duplication | Pass |
| Tabs | Open, activate, close active tab, adjacent activation, return to empty state | Pass |
| Watching | Update a fixture in place/at the watched path and verify one fresh snapshot | Pass |
| Images | Render Markdown and raw-HTML relative local images | Pass |
| Rendering | README raw HTML, headings, links, badges, fenced content, and highlighting | Pass |
| Theme | Toggle light/dark and reload the webview | Pass |
| Native input | Multi-select dialog and native webview drag/drop route through the common validator | Implemented; API/config checked |
| Security boundary | No shell/fs plugin; only registered commands; CSP; image-only backend reads | Pass |
| Packaging | arm64 Mach-O, macOS 11 minimum in plist and load command, app/DMG/zip/checksums | Pass |
| Distribution | Full-bundle ad-hoc signature, DMG verify, local curl-installer, cask syntax/style | Pass |
| Runtime removal | No Electron/Chromium/Node files or Electron/chokidar production packages | Pass |

The cold Finder check specifically covers the macOS open-document event arriving before Tauri setup: paths are queued until runtime state exists, then registered through the normal validated path.
