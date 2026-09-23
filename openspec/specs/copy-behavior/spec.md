# copy-behavior Specification

## Purpose
TBD - created by archiving change update-copy-selection. Update Purpose after archive.
## Requirements
### Requirement: Selection-Aware Copy
When the user copies with a non-empty selection inside the rendered content area, the app SHALL copy only the selected portion converted back to markdown source (not rendered HTML, not plain text, not the full document).

#### Scenario: Copy selected text as markdown
- **WHEN** the user selects a portion of the rendered content and presses Cmd+C
- **THEN** the clipboard SHALL contain only that portion rendered back as markdown

#### Scenario: Copy preserves markdown structure
- **WHEN** the selection includes structured elements (headings, code blocks, lists, tables, bold, links)
- **THEN** the copied markdown SHALL preserve that structure (e.g. `# Heading`, ` ``` `, `- item`, a pipe table, `**bold**`, `[text](url)`)

#### Scenario: Tables use the Google Docs separator
- **WHEN** the copied markdown contains a table, whether that is the full document or a selection
- **THEN** each table SHALL be a pipe table whose separator row uses a leading colon and four dashes per column (`| :---- | :---- |`)
- **AND** each cell SHALL stay on one line, with any pipe character escaped

#### Scenario: Select all copies the document
- **WHEN** the user selects the whole rendered document and copies
- **THEN** the clipboard SHALL contain only that document's markdown, with table separator rows normalized as above and every other line unchanged

#### Scenario: No selection falls back to full document
- **WHEN** the user presses Cmd+C with no active selection
- **THEN** the clipboard SHALL contain the full markdown source, with table separator rows normalized as above and every other line unchanged

#### Scenario: Selection outside content area falls back to full document
- **WHEN** the user presses Cmd+C with a selection that is not within the rendered content area
- **THEN** the clipboard SHALL contain the full markdown source, with table separator rows normalized as above and every other line unchanged

