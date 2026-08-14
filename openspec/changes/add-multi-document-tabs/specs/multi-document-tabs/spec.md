## ADDED Requirements

### Requirement: Multiple Open Documents
The app SHALL keep multiple Markdown documents open simultaneously in one LiveMark window, with one tab for each unique document.

#### Scenario: Open another document from Finder
- **WHEN** a document is already open and the user double-clicks another associated Markdown file in Finder
- **THEN** the app SHALL add and activate a tab for the new document in the existing LiveMark window

#### Scenario: Open multiple documents at launch
- **WHEN** macOS or the CLI supplies multiple supported file paths while the app is launching
- **THEN** the app SHALL create a tab for every supplied document and activate the last successfully opened document

#### Scenario: Select multiple documents in the Open dialog
- **WHEN** the user selects multiple supported files in the native Open dialog
- **THEN** the app SHALL open every selected file as a tab and activate the last successfully opened document

#### Scenario: Drop multiple documents
- **WHEN** the user drops multiple supported files onto the LiveMark window
- **THEN** the app SHALL open every eligible dropped file as a tab and activate the last successfully opened document

#### Scenario: Open an existing document again
- **WHEN** the user opens a file whose canonical path already has a tab
- **THEN** the app SHALL activate the existing tab without creating another tab or file watcher

### Requirement: Independent Live Updates
The app SHALL watch every open document independently and associate file content, metadata, and update state with the correct tab.

#### Scenario: Active document changes on disk
- **WHEN** the active document changes on disk
- **THEN** the app SHALL re-render that document and update only its metadata and update count

#### Scenario: Background document changes on disk
- **WHEN** an inactive document changes on disk
- **THEN** the app SHALL retain the update for that document without replacing the active document's rendered content or metadata

#### Scenario: Activate an updated background document
- **WHEN** the user activates a tab whose document changed while inactive
- **THEN** the app SHALL render that document's latest content, metadata, and update count

### Requirement: Tab Navigation and State
The app SHALL allow users to activate and close document tabs while preserving each open document's presentation state.

#### Scenario: Switch tabs
- **WHEN** the user activates another document tab
- **THEN** the app SHALL display that document's latest rendered content, file path, last-updated time, update count, and saved scroll position

#### Scenario: Copy from the active tab
- **WHEN** the user copies content while multiple tabs are open
- **THEN** the existing selection-aware copy behavior SHALL use only the active document

#### Scenario: Close a tab
- **WHEN** the user closes a document tab
- **THEN** the app SHALL remove the tab, release its file watcher, and activate an adjacent remaining tab

#### Scenario: Close the final tab
- **WHEN** the user closes the only remaining document tab
- **THEN** the app SHALL release its file watcher and show the existing empty state

### Requirement: Tab Accessibility and Themes
The tab bar SHALL provide accessible tab semantics and remain usable in both app themes and narrow supported window sizes.

#### Scenario: Identify and activate tabs accessibly
- **WHEN** assistive technology inspects the tab bar
- **THEN** each tab SHALL expose its document name, selected state, and activation control

#### Scenario: Use tabs in either theme
- **WHEN** the user switches between light and dark themes
- **THEN** active, inactive, hovered, and focused tab states SHALL remain visually distinguishable

#### Scenario: Distinguish global and document controls
- **WHEN** one or more document tabs are open
- **THEN** the app-wide theme control SHALL appear in a persistent toolbar above the tab strip and file-specific metadata SHALL appear below the tab strip

#### Scenario: Tabs exceed available width
- **WHEN** the open tabs require more horizontal space than the window provides
- **THEN** the tab bar SHALL remain navigable without shrinking the document viewport below the app's minimum width
