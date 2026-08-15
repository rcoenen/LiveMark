# Desktop runtime baseline

This file records the Electron 1.3.0 baseline used by the `replace-electron-with-tauri` migration. Measurements were taken on Apple silicon with macOS 26.5.2. They are comparison data, not product performance guarantees.

## Electron 1.3.0

| Measurement | Result |
| --- | ---: |
| Application bundle | 226 MB |
| DMG | 93 MB |
| Zip archive | 88 MB |
| Idle resident memory | approximately 180–275 MB across observed launches |

The artifact sizes come from `du -sh` against the release outputs in `dist/`. Idle memory is the sum of the main, renderer, GPU, and utility processes one second after the first window finishes loading.

## Repeatable comparison

1. Build a release artifact on the same machine and architecture.
2. Record `.app`, DMG, and zip sizes with `du -sh`.
3. Launch with no documents and wait one second after the initial window finishes loading.
4. Sum resident memory for every process owned by that application bundle using `ps -axo rss,command`.
5. Repeat three times after fully quitting the application and report the observed range.
6. Exercise the open-path and rendering parity matrix in the OpenSpec tasks before comparing subjective startup behavior.

## Tauri 1.4.0

| Measurement | Result | Change from Electron |
| --- | ---: | ---: |
| Application bundle | 9.8 MB | 95.7% smaller |
| DMG | 5.9 MB | 93.7% smaller |
| Zip archive | 5.4 MB | 93.9% smaller |
| Idle resident memory | approximately 108–110 MB | approximately 39–60% lower |

The Tauri memory range is from three clean release-mode launches, sampled four seconds after launch. LiveMark uses one application process; WKWebView services are shared macOS system processes and are not shipped in or attributed exclusively to the bundle. A process was observable about 0.12 seconds after a cold `open` request on the measurement machine. Paint readiness was checked visually because the Electron baseline did not include an instrumented ready marker, so no unsupported exact startup comparison is claimed.

The release app, bundled CLI, warm multi-file delivery, duplicate activation, tab closing, empty state, atomic-save refresh, raw and Markdown local images, signature, DMG, curl installer, and cask syntax/style were exercised against the packaged artifact.
