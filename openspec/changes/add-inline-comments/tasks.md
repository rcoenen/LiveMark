## 1. Format
- [x] 1.1 Footer parser: syntax-aware envelope at end of file, duplicate-key-checking JSON, validation, size limits, diagnostics.
- [x] 1.2 Deterministic, escaped serializer that keeps unknown fields and leaves the body bytes untouched.

## 2. Anchors
- [x] 2.1 Map anchors through external edits; recover from quote and context; orphan otherwise.
- [x] 2.2 Map a preview selection to a source range and a source range to highlights, verified by rendering.

## 3. Persistence
- [x] 3.1 Backend command that writes only when the file is unchanged since LiveMark read it, atomically.
- [x] 3.2 A self-written file is not counted as a reload.

## 4. Interface
- [x] 4.1 Highlights, Add comment, keyboard shortcut.
- [x] 4.2 Comments panel section with filters, reply, edit, delete, resolve, reopen, reattach and undo.
- [x] 4.3 Body-only copy, find, word count, change detection and export.

## 5. Release
- [x] 5.1 Prerelease workflow that leaves the stable channel and the Homebrew cask alone.
- [x] 5.2 User and format documentation with an example file.

## 6. Verification
- [x] 6.1 Unit tests for the acceptance criteria that apply to a viewer.
- [x] 6.2 Browser harness checks of the comment flows.
- [ ] 6.3 Manual check in the packaged app.
