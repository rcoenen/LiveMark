## Context
LiveMark renders Markdown in a Tauri 2 webview (WKWebView on macOS, WebView2 on Windows). The window also holds the documents rail, the margin column, and live-reload chrome. Tauri's `print()` opens the system print dialog, and on Windows that call is `window.print()`. Export needs a file, written with the print formatter so `@media print` paginates the article.

## Goals / Non-Goals
- Goals: one menu command writes the focused pane's article to a PDF the user names; the page is white paper; both platforms use the same command.
- Non-Goals: a Print dialog, printer choice, landscape, page numbers, PDF bookmarks, exporting every open tab, a paper-size setting.

## Decisions
- Decision: the renderer marks the focused pane with `is-print-target` and calls `export_pdf`. Rust shows the save dialog and prints. The renderer has no filesystem capability.
- Decision: macOS uses `WKWebView.printOperationWithPrintInfo:` with a copy of `sharedPrintInfo`, `NSPrintSaveJob`, and `NSPrintJobSavingURL`. The print panel stays hidden. The operation is `runOperationModalForWindow`, and the printing view frame is the paper size. `runOperation` returns before WebKit has paginated and writes blank pages until the file is killed. `createPDFWithConfiguration` snapshots the window, so it is not used.
- Decision: Windows uses `ICoreWebView2_7::PrintToPdf` from `webview2-com` 0.38, the same line wry 0.55 binds.
- Decision: `@page { margin: 0.6in }` is the margin. Native print margins are 0 so they do not add a second inset. macOS keeps the user's paper size. Windows selects Letter only when the locale paper size is Letter (value 1); every other locale gets A4.
- Decision: print CSS forces the light palette, including code colors, and drops search highlights and changed-block marks. Long code lines wrap. The Markdown file is never opened for writing.

## Risks / Trade-offs
- WKWebView can ignore `NSPrintSaveJob` and still present a panel, or lay out at the window width. A finished file has to end in `%%EOF`; a header alone is the start of a spool. A file that is missing, truncated, or not a PDF is reported with the same error dialog as a failed CLI install, and a bad file is removed.
- Windows PrintToPdf is compiled behind `cfg(windows)` and is not run in this session.

## Migration Plan
No stored data changes. The menu item appears in the next build. Removing the command leaves documents untouched.

## Open Questions
None.
