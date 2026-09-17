## 1. Pause
- [x] 1.1 Per-document paused flag; hold the newest snapshot and count waiting changes without rendering.
- [x] 1.2 Status block "Paused · N changes waiting" with "Load now"; pause control in the status block and View menu.
- [x] 1.3 On resume, apply the held snapshot as one reload (marks computed against what is on screen).

## 2. Missing file
- [x] 2.1 Backend: emit `document-missing` when a refresh fails with not-found; emit a normal update when the file reappears.
- [x] 2.2 Renderer: "File not found · showing HH:MM:SS" state, last content kept.
- [x] 2.3 `relocate_document` command + "Locate" dialog; carry reload history over to the new id; move the directory watch.
- [x] 2.4 Rust tests for missing/reappearing/relocated documents.

## 3. History popover and settings
- [x] 3.1 Keep changed-block keys per reload; compute "on screen now / still on screen / no longer in document".
- [x] 3.2 Popover UI anchored to the status block, keyboard dismissable, light and dark.
- [x] 3.3 ⌘⇧N steps newest → older → wraps; "Clear marks".
- [x] 3.4 Settings persisted in localStorage and applied to marking, fading and toasts.

## 4. Verification
- [x] 4.1 `npm test`; browser-harness check of all six status states.
- [ ] 4.2 Manual: delete, restore, move and locate a watched file in the packaged app.
