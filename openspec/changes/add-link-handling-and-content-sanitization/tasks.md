## 1. Links
- [x] 1.1 Delegated click handler: anchors, local Markdown links, external links, ignore the rest.
- [x] 1.2 `open_linked_document` command resolving relative to the source document; add `tauri-plugin-opener` for external URLs.
- [x] 1.3 Create the main window in `setup` with an `on_navigation` guard limited to the app origin.

## 2. Sanitisation
- [x] 2.1 Add DOMPurify with an explicit allow-list; sanitise before diffing and injection.
- [x] 2.2 Keep remote `http(s)` images working through the sanitiser; correct the "no network access" line in `openspec/project.md`.
- [x] 2.3 Extend the CSP with `base-uri`, `form-action`, `frame-src`, `object-src`.

## 3. Images and encoding
- [x] 3.1 Extract image path resolution into a pure function: percent-decode, keep `#` in real file names, confine to the document's repository, or its own directory tree when it is not in one.
- [x] 3.2 Return mtime with resolved images; cache in the renderer and reuse synchronously on re-render.
- [x] 3.3 Strip UTF-8 BOM in `load_snapshot`; emit an `open-failed` event and show it as a toast.

## 4. Verification
- [x] 4.1 Rust unit tests: path decoding, traversal rejection, BOM, linked-document resolution.
- [x] 4.2 Add a JS test runner (vitest) with sanitiser and link-classification tests.
- [ ] 4.3 Manual: click external, local and anchor links in the packaged app; confirm the webview never navigates.
