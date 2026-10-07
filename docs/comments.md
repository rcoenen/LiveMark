# Comments (experimental)

LiveMark 1.7.0-experimental lets you leave review comments on a Markdown file. The comments are saved inside the file itself, so they travel with it: copy the `.md` to another machine, open it in LiveMark, and the discussion is still there. No account, server or sidecar file is involved.

This is LiveMark's own format. It is not a Google Docs format, and Google Docs will not show these comments.

## Using comments

- **Comment:** select text in the document and press the **Comment** button that appears, or press ⌘⌥M (Ctrl+Alt+M on Windows). Type the comment and press ⌘↩ (Ctrl+Enter). The first time, LiveMark asks for the name to show on your comments.
- **Where:** a selection must stay within one paragraph, heading, list item or quote. Code, images, tables and raw HTML cannot be commented on yet; the button explains why when that is the case.
- **Panel:** comments appear in the **Comments** section of the right panel. Like the other sections, it collapses and can be dragged to the left panel. **Open**, **Resolved**, **All** and **Unattached** filter the list.
- **Highlights:** commented text is highlighted. Clicking a highlight opens its thread; where comments overlap, LiveMark asks which one. Clicking the quote on a thread scrolls to its text.
- **Threads:** reply, edit or delete a message, resolve or reopen a thread, or delete the whole thread. Deleting and resolving show **Undo**; ⌘⌥Z (Ctrl+Alt+Z) undoes the last comment change too.

## When an agent edits the file

LiveMark never changes the document text. It only writes the comment block at the end of the file, and only when the file on disk is exactly what it last read. If another program changed the file in the meantime, the save is refused, your draft stays, and LiveMark picks up the newer file.

When the text changes outside LiveMark, comments follow it:

- Text added before or after a comment leaves it on the same words.
- If part of the commented text is deleted, the comment keeps the rest.
- If all of it is deleted or replaced, the comment moves to **Unattached** with its last quote and every message. **Reattach** lets you select new text for it.
- When LiveMark opens a file whose text changed since the comments were saved, a comment is re-attached only where its exact quote and the text around it appear exactly once. Anything else becomes unattached; LiveMark never guesses.

Moved anchors are saved with your next comment change.

If a program appended text after the comment block, comments become read-only and LiveMark offers **Move comments to the end**, which keeps the document text in order and moves only the block. A comment block that is broken, duplicated or written by a newer version is left exactly as it is and comments stay read-only, with the reason shown.

## Copying and exporting

Copy, Copy as Plain Text, Find, the word count and Export as PDF all use the document without its comments. To share a file without comments, select all, copy, and paste into a new file.

## The format

The comment block is one HTML comment at the very end of the file, after an empty line:

```text
BODY + EOL + EOL + "<!--livemark:comments" + EOL + JSON + EOL + "-->" + EOL
```

Most Markdown renderers hide HTML comments, so the file still reads normally elsewhere. Hiding is not encryption: the comments are plain text in the file.

| Field | Meaning |
| --- | --- |
| `format`, `version`, `offsetUnit` | Always `"livemark-comments"`, `1` and `"utf16"`. |
| `bodySha256` | SHA-256 of the body's UTF-8 bytes, to notice that the text changed. |
| `threads[]` | `id`, `status` (`open` or `resolved`), `anchor`, and `messages`. |
| `anchor` | `state` (`attached` or `orphaned`), `start` and `end` as UTF-16 offsets into the body (`null` when orphaned), the `exact` source text, and up to 32 characters of `prefix` and `suffix` context. |
| `messages[]` | `id`, `author` (`id`, `name`), `createdAt`, optional `updatedAt` (UTC timestamps), and plain-text `content`. |

`<`, `>`, `&` and `--` are written as JSON escapes, so message text can never end the HTML comment early. Unknown fields are kept when LiveMark saves. [examples/commented.md](examples/commented.md) is a complete example.

## Limits of this experimental version

- macOS only.
- Comments can be added in the rendered document only; LiveMark has no text editor.
- Undo covers comment changes made in this session; there is no redo.
- Author names are labels typed on this computer, not verified identities.
- No sync with Google Docs or any other service.
