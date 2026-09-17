## ADDED Requirements
### Requirement: Go To File
The app SHALL provide a ⌘P palette that finds open documents and Markdown files located in the directories of open documents by fuzzy match on file name, and opens or activates the chosen file.

#### Scenario: Activate an open document
- **WHEN** the user presses ⌘P, types part of an open document's name and presses Enter
- **THEN** that document SHALL become active

#### Scenario: Open a sibling file
- **WHEN** the user chooses a Markdown file that is not open yet
- **THEN** it SHALL open as a new document in the rail

### Requirement: Folder Grouping
The app SHALL group documents in the rail under their parent folder name when open documents come from more than one folder.

#### Scenario: Single folder
- **WHEN** all open documents share one folder
- **THEN** the rail SHALL show a single "Documents" list without group headings

### Requirement: Outgoing Links List
The app SHALL list the active document's distinct links in the margin column, and activating an entry SHALL behave exactly like activating that link in the document.

#### Scenario: Document without links
- **WHEN** the active document contains no links
- **THEN** the section SHALL be hidden

### Requirement: Numbered Document Shortcuts
The app SHALL activate the nth document in the rail when the user presses ⌘1 through ⌘9.

#### Scenario: Shortcut beyond the list
- **WHEN** the user presses ⌘7 with four documents open
- **THEN** nothing SHALL happen
