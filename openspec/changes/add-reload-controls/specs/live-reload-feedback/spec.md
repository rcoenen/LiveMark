## ADDED Requirements
### Requirement: Pause Live Reload
The app SHALL let the user pause live reload for a document. While paused the app SHALL keep the displayed content and scroll position unchanged, count the changes that are waiting, and offer "Load now".

#### Scenario: Changes arrive while paused
- **WHEN** a paused document changes on disk twice
- **THEN** the content on screen SHALL NOT change and the status block SHALL read "Paused · 2 changes waiting"

#### Scenario: Load now
- **WHEN** the user activates "Load now"
- **THEN** the newest version SHALL be rendered as a single reload with its changed blocks marked, and live reload SHALL resume

### Requirement: Missing File State
The app SHALL keep the last loaded version on screen when a watched file can no longer be read, SHALL show "File not found" with the time of the version shown, and SHALL offer "Locate" to choose the file's new path.

#### Scenario: File deleted or moved
- **WHEN** the watched file is deleted or moved
- **THEN** the document SHALL stay open with its last content and the status block SHALL read "File not found"

#### Scenario: File reappears
- **WHEN** a file reappears at the original path
- **THEN** the document SHALL reload and return to the live state

#### Scenario: Locate
- **WHEN** the user picks a new path through "Locate"
- **THEN** the document SHALL watch the new path and keep its change count and reload history

### Requirement: Reload History
The app SHALL show, on request, the reloads of the active document since it was opened with time, summary, number of changed blocks and whether those blocks are still in the document, and SHALL let the user step through them and clear all marks.

#### Scenario: Stepping through reloads
- **WHEN** the user presses ⌘⇧N repeatedly
- **THEN** the view SHALL move from the newest reload's changes to older ones whose blocks still exist

#### Scenario: Clear marks
- **WHEN** the user activates "Clear marks"
- **THEN** all block marks and outline dots SHALL be removed while the change count is kept

### Requirement: Reload Feedback Settings
The app SHALL persist user settings for marking changed blocks, fading marks after 8 seconds, and notifying on every reload.

#### Scenario: Marks disabled
- **WHEN** "Mark changed blocks" is off and a document reloads
- **THEN** no blocks SHALL be marked and the change count SHALL still increase
