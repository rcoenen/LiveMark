## ADDED Requirements
### Requirement: Two-Pane Reading
The app SHALL let the user split the workspace into two panes, each showing one open document at its own fixed measure with independent scroll position, reload marks and reading-position preservation.

#### Scenario: Reload in one pane
- **WHEN** the document in the right pane reloads
- **THEN** only the right pane SHALL re-render and the left pane's scroll position SHALL be unchanged

#### Scenario: Window too narrow
- **WHEN** the window is narrower than the minimum split width
- **THEN** the app SHALL show only the focused pane

### Requirement: Pane Assignment
The app SHALL let the user send a document from the rail to the left or right pane and SHALL badge documents in the rail with the pane that shows them.

#### Scenario: Send to right pane
- **WHEN** the user chooses "Open in right pane" for a document
- **THEN** it SHALL be shown in the right pane and its rail tab SHALL carry an "R" badge

### Requirement: Focused Pane
The app SHALL apply copy, jump-to-newest-change, the live status block and the window title to the pane that last received focus.

#### Scenario: Copy with two panes
- **WHEN** the user copies with no selection while the right pane is focused
- **THEN** the right pane's document SHALL be copied as Markdown
