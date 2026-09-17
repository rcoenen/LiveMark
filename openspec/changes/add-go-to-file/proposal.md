## Why
Mockup 2b gives the rail a "Go to file" field (⌘P), groups documents by folder, and lists the document's outgoing links in the margin column. With many open documents the flat rail list stops scaling.

## What Changes
- ⌘P palette: fuzzy-find across open documents and the Markdown files in the directories of open documents; Enter opens or activates.
- Rail groups open documents under their parent folder name when more than one folder is involved.
- Margin column section "Links out to": the document's links, de-duplicated; activating one behaves like clicking it in the text.
- ⌘1–9 activates the nth document.

## Feasibility
| Part | Verdict | Notes |
|---|---|---|
| Palette over open documents | Can be done, renderer only | |
| Palette over sibling files | Can be done | New `list_sibling_documents` command: non-recursive listing of already-watched directories, filtered by the same extension rule as `resolve_document_path`. |
| Whole-project recursive search | Not in this change | LiveMark has no project root; recursive scans of arbitrary parents (e.g. `~`) are slow and surprising. Could follow once a "folder" concept exists. |
| Folder grouping | Can be done, renderer only | Group by parent directory; ids are canonical paths. |
| ⌘P / ⌘1–9 shortcuts | Can be done | No conflict in `menu.rs` (⌘P is unused; there is no Print item). Add as menu items so they work when focus is outside the webview. |
| "Links out to" | Can be done, depends on `add-link-handling-and-content-sanitization` | Without link handling, activating an entry would navigate the webview away. |

## Impact
- Affected specs: `document-navigation` (new)
- Depends on: `update-window-layout-and-reload-feedback`, `add-link-handling-and-content-sanitization`
- Affected code: `src/renderer/*`, `index.html`, `src-tauri/src/lib.rs`, `src-tauri/src/menu.rs`
