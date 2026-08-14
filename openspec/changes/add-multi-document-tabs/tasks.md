## 1. Main Process Document Lifecycle
- [x] 1.1 Replace the singleton file watcher with a document registry that owns one watcher per canonical file path.
- [x] 1.2 Queue every Finder or CLI file-open request received before the app is ready, then open each file after window creation.
- [x] 1.3 Support multi-selection in the native Open dialog and open every selected file.
- [x] 1.4 Focus an already-open document instead of creating a duplicate watcher.
- [x] 1.5 Close individual document watchers on request and close all watchers when the app exits.
- [x] 1.6 Keep the native window title synchronized with the active document.

## 2. Secure IPC Bridge
- [x] 2.1 Define document-scoped open, update, activation, and close payloads.
- [x] 2.2 Update the preload bridge and renderer type declarations without exposing Node.js APIs.

## 3. Tabbed Renderer
- [x] 3.1 Add an accessible tab bar with active, inactive, and close controls.
- [x] 3.2 Store content, metadata, update count, and scroll position independently for each open document.
- [x] 3.3 Render and copy from only the active document while retaining background document updates.
- [x] 3.4 Open all eligible files from a multi-file drag and drop operation.
- [x] 3.5 Restore the empty state after the final tab closes.
- [x] 3.6 Place global controls above the tab bar and style the hierarchy for light and dark themes and narrow window widths.

## 4. Verification
- [x] 4.1 Run the TypeScript and renderer production build.
- [x] 4.2 Verify that opening multiple files through Finder, the Open dialog, drag and drop, and CLI produces independent tabs.
- [x] 4.3 Verify independent live updates, tab switching, active-document copy behavior, duplicate-open focus, tab closing, and watcher cleanup.
- [x] 4.4 Confirm the existing theme toggle and single-document workflow still work.
