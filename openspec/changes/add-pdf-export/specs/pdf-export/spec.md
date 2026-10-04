## ADDED Requirements
### Requirement: Export the focused document as a PDF
The user MUST be able to export the document shown in the focused pane as a PDF file. The command SHALL be File → Export as PDF…, with shortcut Cmd+E on macOS and Ctrl+E on Windows. The app SHALL open a save dialog titled "Export as PDF", starting in the document's folder, with a suggested name of the source stem plus `.pdf`. The written file SHALL be a PDF of that pane's rendered article.

#### Scenario: Export saves a PDF
- **WHEN** a document is shown in the focused pane and the user confirms Export as PDF…
- **THEN** LiveMark writes a PDF of that article to the chosen path

#### Scenario: Suggested name from a Markdown file
- **WHEN** the open document is named `notes.md` or `notes.markdown`
- **THEN** the suggested file name SHALL be `notes.pdf`

#### Scenario: Suggested name keeps the stem
- **WHEN** the open document is named `README` or `My Notes.md`
- **THEN** the suggested file name SHALL be `README.pdf` or `My Notes.pdf`

#### Scenario: Cancel writes nothing
- **WHEN** the user dismisses the save dialog
- **THEN** LiveMark SHALL write no file

#### Scenario: No document
- **WHEN** the focused pane has no document
- **THEN** Export as PDF… SHALL do nothing and SHALL not open the save dialog

#### Scenario: Split view exports the focused pane
- **WHEN** two panes are visible and the user exports
- **THEN** the PDF SHALL contain the focused pane's article and SHALL omit the other pane

### Requirement: The PDF is the article on paper
The PDF SHALL show the rendered article on a white page and SHALL omit the documents rail, the margin column, window chrome, search highlights, and changed-block marks. Dark mode SHALL NOT change the page colors. Long lines in code blocks SHALL wrap onto the page. The source Markdown file SHALL remain unchanged. Page margins SHALL be 0.6 inches. macOS SHALL use the user's default paper. Windows SHALL use Letter when the locale paper is Letter, and A4 otherwise.

#### Scenario: Chrome stays out of the file
- **WHEN** the user exports a document while the rail and margin column are visible
- **THEN** the PDF SHALL contain the article and SHALL omit the rail and the margin column

#### Scenario: Dark mode still prints on white
- **WHEN** the app is in dark mode and the user exports
- **THEN** the PDF page SHALL be white with dark text

#### Scenario: The Markdown file is untouched
- **WHEN** the user exports a document
- **THEN** the source Markdown file SHALL be byte-for-byte unchanged
