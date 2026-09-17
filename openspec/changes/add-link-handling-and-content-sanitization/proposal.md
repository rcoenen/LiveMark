## Why
The rendering audit (2026-09-17) found that clicking any link navigates the app's own webview away (only quitting recovers), that raw HTML is injected unsanitised with the CSP as the only barrier, and that local images with spaces or non-ASCII names never load. LiveMark's main use is watching files written by other tools and agents, i.e. untrusted content.

## What Changes
- Link handling: external links open in the default browser; links to local Markdown files open as documents; `#anchor` links scroll in place; everything else is ignored. A Rust `on_navigation` guard denies any navigation away from the app origin.
- Sanitise rendered HTML (DOMPurify): drop `script`, `style`, `meta`, `base`, `form`, `iframe`, `object`, event-handler attributes and `javascript:` URLs.
- Tighten CSP: `base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'`.
- Local images: percent-decode paths, restrict reads to the document's repository (or its own directory tree outside a repository), cache resolved images by path + mtime.
- Strip a UTF-8 BOM; surface "could not open" errors in the UI instead of stderr.
- **BREAKING**: documents relying on raw `<style>`, `<iframe>` or forms render without them. Remote images stay allowed (decided 2026-09-17); `openspec/project.md` is updated to say so instead of "no network access".

## Feasibility
| Part | Verdict | Notes |
|---|---|---|
| Click handling + anchors | Can be done | Delegated listener on `#content`; heading ids already exist. |
| Open external links | Can be done | Needs `tauri-plugin-opener` (new dependency + capability entry). |
| Open local `.md` links | Can be done | Resolve against the document directory in Rust, reuse `register_document`. |
| `on_navigation` guard | Can be done | Tauri 2 `WebviewWindowBuilder::on_navigation`; the window is currently declared in `tauri.conf.json`, so it must be created in `setup` instead. |
| DOMPurify | Can be done | ~20 KB dependency, runs before block diffing so marks are unaffected. |
| Image path decoding, scoping, BOM | Can be done | Pure Rust functions; unit-testable. |
| Image cache | Can be done | Renderer-side `Map` keyed by resolved path + mtime; requires the command to return mtime. |
| Verifying WKWebView honours the CSP for injected markup | Cannot be verified from tests | Needs a manual check in the packaged app; sanitising makes it moot for the listed vectors. |
| Blocking remote image beacons | Decided: not done | Remote `http(s)` images keep loading; the sanitiser and CSP keep `img-src ... http: https:`. |

## Impact
- Affected specs: `rendered-content-safety` (new)
- Affected code: `src/renderer/renderer.ts`, `src/renderer/platform.ts`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`, `package.json`
