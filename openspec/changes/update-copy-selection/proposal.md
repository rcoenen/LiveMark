# Change: Copy selected rendered markdown as markdown source

## Why
Currently Cmd+C always copies the entire raw markdown source regardless of selection. Users want to select a portion of the rendered preview and copy just that section back as markdown — not raw HTML, not plain text, not the whole document.

## What Changes
- When the user has a non-empty selection inside the rendered content area, Cmd+C copies only the selected portion converted back to markdown
- When there is no selection (or the selection is outside the content area), Cmd+C falls back to the existing behavior: copy the full raw markdown source
- The "Copied as Markdown" notification is shown in both cases
- Add `turndown` as a runtime dependency for HTML-to-markdown conversion

## Impact
- Affected specs: copy-behavior (new capability)
- Affected code: `src/renderer/renderer.ts`, `package.json`
