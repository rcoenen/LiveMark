## Why
The toolbar, tab bar and metadata header stack above the document and use ~230px of vertical space, while a fixed Markdown measure leaves the horizontal space of a landscape window idle. A reload is only signalled by a brief flash, so a reader cannot tell what changed or whether they are looking at the newest version.

Design source: Claude Design project "LiveMark Mockups" and its handoff (`design_handoff_livemark_window/README.md`). Final layout is option 5a: the 2b frame, the 3a reload feedback, the 4b/4c scroll-ownership rule, and the live state consolidated in the margin column.

## What Changes
- Replace the top toolbar, horizontal tab bar and sticky metadata header with a left documents rail: vertical tabs with change badges, close buttons (shown on hover, on the active row and during keyboard focus), drag to reorder, theme toggle and version. The rail answers "which document".
- The margin column answers "about this document": a live card (state, last three reloads, "All reloads"), outline, outgoing links and file facts. When the column cannot be shown the live card is pinned to the bottom of the rail.
- Scroll ownership: the window never scrolls; only document panes do, the chrome is opaque and gains a soft shadow while text is scrolled beneath it.
- Find in document (⌘F).
- All interface copy goes through a string table (`src/renderer/strings.ts`), English only for now.
- Fix the reading measure at 680px and use surplus width for a margin column: outline ("On this page"), reload log and file facts. The column hides when the window is too narrow.
- Use an overlay title bar so the rail runs to the top of the window; rail and top strip are drag regions.
- Live-reload feedback in three layers: persistent change count since the document was opened, in-document marks on changed blocks (table rows and list items individually) that fade after 8s, and an opt-in toast with a "View" action ("Notify on every reload", off by default). The full-screen flash is removed.
- Keep the reader on the same paragraph when content is added or removed above it.
- "Jump to newest change" (⌘⇧N).
- Restyle on Radix Themes tokens (slate gray, indigo accent, green live state) for light and dark themes. No accent rules on the left edge of rows or changed blocks: state is tint plus weight.
- **BREAKING (UI)**: theme toggle moves from the header to the rail footer.

Not included (later changes): pause/“Load now”, “File not found / Locate”, reload-history popover with settings, ⌘P go-to-file, split panes.

## Impact
- Affected specs: `window-layout` (new), `live-reload-feedback` (new), `theme-toggle` (modified)
- Relates to pending change `add-multi-document-tabs`: tabs keep their behaviour but are presented vertically in the rail.
- Affected code: `index.html`, `src/renderer/renderer.ts`, `src/renderer/styles.css`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
