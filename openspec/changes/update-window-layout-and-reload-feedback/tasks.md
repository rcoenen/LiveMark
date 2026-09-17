## 1. Layout
- [x] 1.1 Replace toolbar, tab bar and metadata header with the documents rail and margin column in `index.html`.
- [x] 1.2 Restyle on Radix tokens for light and dark themes; hide the margin column below 1140px.
- [x] 1.3 Enable the overlay title bar, drag regions and the start-dragging permission; widen the default window.

## 2. Live-reload feedback
- [x] 2.1 Detect changed top-level blocks, table rows and list items between renders, including for background documents.
- [x] 2.2 Mark changed blocks, fade marks after 8s, and show outline dots for changed sections.
- [x] 2.3 Status block states: idle, reloaded flash, count, being edited.
- [x] 2.4 Reload log, toast with View, and ⌘⇧N jump to newest change.
- [x] 2.5 Preserve reading position across reloads by anchoring to the visible block.

## 3. Handoff 5a
- [x] 3.1 Move the live card to the margin column with the last three reloads and "All reloads"; fall back to the rail bottom when the column is hidden.
- [x] 3.2 Slate tokens, scrolled-edge shadow, close buttons on hover/active/focus, rail rows reorderable by drag.
- [x] 3.3 Reload toast opt-in; block count in the changed-block label.
- [x] 3.4 Find in document (⌘F) with hit count and Enter / Shift+Enter stepping.
- [x] 3.5 String table for all interface copy, including static markup.
- [x] 3.6 Text zoom (⌘+ / ⌘= / ⌘- / ⌘0) for the document only, persisted; replaces whole-window zoom in the View menu.

## 4. Verification
- [x] 4.1 TypeScript and frontend production build, Rust tests.
- [x] 4.2 Browser harness check of marks, toast, status, outline and scroll anchoring in both themes.
- [ ] 4.3 Manual check in the packaged Tauri window: traffic-light placement, window dragging, ⌘⇧N.
