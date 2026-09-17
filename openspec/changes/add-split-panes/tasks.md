## 1. Refactor
- [x] 1.1 Extract `DocumentPane` (render, images, marks, anchors, scroll-spy) on a container scroll model; single-pane behaviour unchanged.
- [x] 1.2 Move scroll positions to a per-pane map.

## 2. Two-pane mode
- [x] 2.1 Split / unsplit command (View menu, shortcut) with a minimum window width.
- [x] 2.2 Pane headers, focused-pane tracking; copy, ⌘⇧N, status block and window title follow focus.
- [x] 2.3 L / R badges and "Open in left/right pane" in the rail.
- [x] 2.4 Implement rail → pane drag with HTML5 drag-and-drop (works in the browser harness).
- [ ] 2.5 Verify that drag in WKWebView with `dragDropEnabled`; the L / R buttons are the fallback.

## 3. Verification
- [x] 3.1 `npm test`; harness check of independent scroll, marks and reloads per pane.
- [ ] 3.2 Manual: Finder file drop still works; overlay title bar and scrolling feel right in the packaged app.
