# Change: Inline review comments stored in the Markdown file (experimental)

## Why
Agents and people now review the same Markdown files. Google Docs started editing and commenting on `.md` files natively on 5 October 2026, but its announcement does not say how comments are kept in the file. LiveMark readers need to leave a remark on a passage of an agent-written document and have that remark travel with the file, without a sidecar, account or service.

Governing format: "LiveMark inline comments specification, version 1" (livemark-comments, footer JSON block, UTF-16 anchors with quote and context). This is a LiveMark format, not a Google one.

## What Changes
- **BREAKING (domain rule)**: LiveMark stops being strictly read-only. It may write one thing to a Markdown file: the owned `<!--livemark:comments … -->` block at the end. It never changes the document text above that block. Every write checks that the file on disk still holds exactly what LiveMark last read, and replaces the file atomically.
- Readers select text in the rendered document and add a comment. Comments appear as highlights linked to a "Comments" panel section with Open, Resolved, All and Unattached views, replies, editing, deleting, resolving, reopening and reattaching.
- Edits made by other tools (an agent, an editor) move anchors with the edit when LiveMark saw the previous version, and otherwise recover them from the exact quote plus its context. Anything ambiguous becomes unattached, never silently reassigned.
- Copy, find, word count, change detection and PDF export use the document body without the comment block.
- Malformed or unsupported comment blocks are kept byte for byte and put comments into read-only mode.
- Shipped as `1.7.0-experimental.1`, a GitHub prerelease. Stable users, auto-update and the Homebrew cask stay on 1.6.5.

## Out of scope
- Editing the document text. LiveMark has no editor, so the spec's editor-transaction rules apply to external edits only, and undo covers comment actions.
- Google import or export, accounts, sync, mentions, suggestions and real-time collaboration.

## Impact
- Affected specs: `inline-comments` (new)
- Affected code: new `src/renderer/comments/*`, `src/renderer/renderer.ts`, `src/renderer/pane.ts`, `src/renderer/markdown.ts`, `index.html`, `src/renderer/styles.css`, `src/renderer/strings.ts`, `src-tauri/src/lib.rs`, `src-tauri/src/document.rs`, a prerelease workflow.
