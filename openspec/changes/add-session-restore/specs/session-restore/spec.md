## ADDED Requirements
### Requirement: Session Persistence
The app SHALL persist the open document paths in rail order and the active document id whenever the set of open documents or the active document changes.

#### Scenario: Document closed
- **WHEN** the user closes a document
- **THEN** the persisted session SHALL no longer contain that document

### Requirement: Session Restore
On launch the app SHALL reopen the persisted documents in their previous order and reactivate the previously active document.

#### Scenario: Update relaunch
- **WHEN** the app relaunches after a self-update
- **THEN** the documents open before the update SHALL be restored

#### Scenario: Missing file
- **WHEN** a persisted document's file no longer exists at launch
- **THEN** that document SHALL be skipped without an error dialog

#### Scenario: Command-line documents merge
- **WHEN** the app is launched with document paths as arguments
- **THEN** those documents SHALL open in addition to the restored session and a restored document already covered by an argument SHALL not be duplicated

### Requirement: Quit Preserves Session
Quitting the app SHALL NOT erase the persisted session, even though quitting closes all open documents.

#### Scenario: Quit and relaunch
- **WHEN** the user quits with documents open and relaunches
- **THEN** the previously open documents SHALL be restored
