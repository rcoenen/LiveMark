## ADDED Requirements
### Requirement: Persistent Change Count
The app SHALL count reloads per document from the moment it is opened until it is closed, and SHALL show the count on the document's rail tab and in the live status block together with the opened time and the time of the last reload.

#### Scenario: Unchanged document
- **WHEN** the active document has not reloaded since it was opened
- **THEN** the status block SHALL read "Live · no changes"

#### Scenario: Reload confirmation
- **WHEN** the active document reloads
- **THEN** the status block SHALL show "Reloaded" with the time for about 1.5 seconds and then show the change count

#### Scenario: Heavy activity
- **WHEN** the active document reloads three or more times within ten seconds
- **THEN** the status block SHALL read "Being edited" with the change count

### Requirement: Changed Block Marks
The app SHALL mark the blocks that a reload changed or added, marking individual table rows and list items when only some of them changed, and SHALL fade the marks after 8 seconds. Sections containing changes SHALL be flagged in the outline. Marks SHALL NOT alter copied Markdown.

#### Scenario: Paragraph rewritten
- **WHEN** a watched file is saved with one paragraph changed
- **THEN** only that paragraph SHALL be marked, labelled with the reload time

#### Scenario: Table row changed
- **WHEN** one row of a table changes
- **THEN** only that row SHALL be marked

### Requirement: Reload Notification
The app SHALL confirm a reload through the live card and the changed-block marks, SHALL list recent reloads in the live card, and SHALL NOT flash the screen, show a dialog or move the reading position. When "Notify on every reload" is enabled (off by default) the app SHALL additionally show a non-modal toast stating how many blocks changed and offering a "View" action.

#### Scenario: Default notification behaviour
- **WHEN** a document reloads with default settings
- **THEN** no toast SHALL be shown

#### Scenario: Jump to newest change
- **WHEN** the user activates "View", "Jump to newest change" or presses ⌘⇧N
- **THEN** the document SHALL scroll to the first block changed by the newest reload and re-show its marks

### Requirement: Reading Position Preservation
The app SHALL keep the block at the top of the viewport in place when the active document reloads, even when content is added or removed above it.

#### Scenario: Text added above the reading position
- **WHEN** a paragraph is added above the visible part of the document
- **THEN** the visible blocks SHALL stay at the same position on screen
