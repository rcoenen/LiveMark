## ADDED Requirements
### Requirement: Comments Stored In The File
LiveMark SHALL store comment threads in one `<!--livemark:comments` JSON block at the end of the Markdown file, preceded by exactly two line endings, and SHALL never change the document text before that block.

#### Scenario: Reopen elsewhere
- **WHEN** a commented file is copied to another machine and opened in LiveMark
- **THEN** every thread, message, author, timestamp and quote SHALL reappear without a sidecar or network request

#### Scenario: Comment-only change
- **WHEN** the user adds, edits, resolves or deletes a comment
- **THEN** the bytes of the document text SHALL be identical before and after the write

### Requirement: Safe Writes
LiveMark SHALL write a file only when its current contents equal what LiveMark last read, and SHALL replace it atomically. Otherwise it SHALL keep the pending comment change and report the conflict.

#### Scenario: Agent edited the file meanwhile
- **WHEN** the file changed on disk after LiveMark read it and the user saves a comment
- **THEN** the write SHALL be refused, the comment SHALL stay pending, and the newer file SHALL be reloaded before retrying

### Requirement: Anchors Follow External Edits
When the document text changes outside LiveMark, anchors SHALL move with the edit when the previous text is known, and otherwise SHALL be recovered only from a single exact match of the quote and its context. Any other case SHALL mark the thread unattached and keep all its messages.

#### Scenario: Text inserted before a comment
- **WHEN** an agent inserts a paragraph above a commented phrase
- **THEN** the same phrase SHALL stay highlighted

#### Scenario: Commented text deleted
- **WHEN** the commented text is removed
- **THEN** the thread SHALL move to Unattached with its last known quote and every message

### Requirement: Commenting On The Rendered Document
The user SHALL be able to select text within one paragraph, heading, list-item paragraph or quote paragraph of the rendered document and add a comment. Selections that cross blocks or touch code, images, raw HTML or tables SHALL be refused without changing the file.

#### Scenario: Repeated phrase
- **WHEN** the user selects the second occurrence of a phrase that appears twice
- **THEN** the comment SHALL anchor to the second occurrence

### Requirement: Invalid Comment Data Is Preserved
A malformed, duplicated, oversized or unsupported comment block SHALL be kept byte for byte, and comments SHALL be read-only for that file with the reason shown.

#### Scenario: Broken JSON
- **WHEN** the comment block contains invalid JSON
- **THEN** LiveMark SHALL show the reason, allow no comment changes, and never replace the block with an empty one
