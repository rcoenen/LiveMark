# Change: Add Multi-Document Tabs

## Why
LiveMark currently owns one window-level file watcher, so opening a Markdown file replaces the document already being viewed. Users need to keep several Markdown documents open at once while each document continues to update from disk.

## What Changes
- Add a tab bar that represents every document open in the LiveMark window.
- Place app-wide controls in a persistent toolbar above the document tabs and keep file-specific metadata below them.
- Give every open document its own file watcher, rendered content, metadata, update count, and active-tab state.
- Open files received from Finder, the Open dialog, drag and drop, or the CLI as tabs and activate the newly opened document.
- Focus an existing tab when the same file is opened again instead of creating a duplicate watcher or tab.
- Allow tabs to be closed independently and release the corresponding file watcher.
- Preserve the existing empty state when no documents are open and the existing theme and copy behavior for the active document.

## Impact
- Affected specs: `multi-document-tabs` (new capability)
- Affected code: `src/main/main.ts`, `src/preload/preload.ts`, `src/renderer/renderer.ts`, `src/renderer/styles.css`, `src/types.d.ts`, `index.html`, `resources/bin/livemark`
- Runtime behavior: the main process will manage a collection of document watchers instead of one singleton watcher
- No breaking user-facing changes; existing single-document use continues to work as a one-tab case
