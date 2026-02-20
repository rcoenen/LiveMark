## ADDED Requirements

### Requirement: Selection-Aware Copy
When the user copies with a non-empty selection inside the rendered content area, the app SHALL copy only the selected portion converted back to markdown source (not rendered HTML, not plain text, not the full document).

#### Scenario: Copy selected text as markdown
- **WHEN** the user selects a portion of the rendered content and presses Cmd+C
- **THEN** the clipboard SHALL contain only that portion rendered back as markdown

#### Scenario: Copy preserves markdown structure
- **WHEN** the selection includes structured elements (headings, code blocks, lists, bold, links)
- **THEN** the copied markdown SHALL preserve that structure (e.g. `# Heading`, ` ``` `, `- item`, `**bold**`, `[text](url)`)

#### Scenario: No selection falls back to full document
- **WHEN** the user presses Cmd+C with no active selection
- **THEN** the clipboard SHALL contain the full raw markdown source (existing behavior)

#### Scenario: Selection outside content area falls back to full document
- **WHEN** the user presses Cmd+C with a selection that is not within the rendered content area
- **THEN** the clipboard SHALL contain the full raw markdown source
