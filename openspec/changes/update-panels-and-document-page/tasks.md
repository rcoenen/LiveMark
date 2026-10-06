## 1. Document page
- [ ] 1.1 Wrap each pane's content in a page sheet with ring, shadow and radius; add workspace and sheet tokens for both themes.
- [ ] 1.2 Recompute the rail width limit and collapse breakpoint for the sheet padding and the docked right panel.
- [ ] 1.3 Print and PDF export render the document without the sheet.

## 2. Panels
- [ ] 2.1 Dock the right panel full height with Changes, Links out to and file facts; move "On this page" into the rail.
- [ ] 2.2 Section headers with collapse chevrons and collapsed summaries; persist collapsed state.
- [ ] 2.3 Move Changes and On this page between panels by drag or by clicking the grip; persist placement.
- [ ] 2.4 Hide the rail into the Documents tab and the right panel into a strip; persist both.
- [ ] 2.5 Bottom-left bar with version, theme button and update status while the rail is folded.
- [ ] 2.6 Fall back to the rail for sections placed in the right panel while that panel cannot be shown.

## 3. Other
- [ ] 3.1 Move the app update banner into the rail footer.
- [ ] 3.2 Show the file name and current section in the title bar once the title has scrolled away.
- [ ] 3.3 Reload log rows jump to their reload.

## 4. Verification
- [ ] 4.1 TypeScript, frontend build, unit tests and Rust tests.
- [ ] 4.2 Browser harness check of both themes, several documents, scrolled state, collapsed sections and both hidden panels.
- [ ] 4.3 Manual check in the packaged Tauri window: drag between panels, traffic lights with the rail hidden, update banner.
