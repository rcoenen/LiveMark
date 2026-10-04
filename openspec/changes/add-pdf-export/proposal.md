# Change: Export the focused document as a PDF

## Why
LiveMark can show a document and copy its Markdown, and it cannot hand someone the rendered page. Export as PDF writes that page to a file the user chooses.

## What Changes
- File → Export as PDF… (⌘E / Ctrl+E) opens a save dialog and writes the focused document.
- The PDF is the article on white paper: the documents rail, margin column, and the rest of the window chrome stay out.
- The suggested file is the Markdown stem plus `.pdf`, in the document's folder. Cancelling writes nothing.
- With no document in the focused pane, the command does nothing.
- Paper follows the machine. macOS uses the user's default paper. Windows uses Letter when the locale paper is Letter, and A4 otherwise. Margins are 0.6 in. The app theme does not change the page colors.

## Impact
- Affected specs: `pdf-export` (new)
- Affected code: `src-tauri/src/menu.rs`, `src-tauri/src/pdf.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/renderer/platform.ts`, `src/renderer/renderer.ts`, `src/renderer/styles.css`
- Version: patch 1.6.4. The commit is `fix:` with `Release-As: 1.6.4`, so Release Please does not open a minor bump.
