## ADDED Requirements
### Requirement: Documents Rail
The app SHALL present open documents as vertical tabs in a fixed left rail, each with its file name, a change-count badge when the document has reloaded, and a close control that is visible on hover, on the active row and while keyboard focus is in the rail. Rows SHALL be reorderable by drag. The rail SHALL also show the number of watched files and the app version. Active state SHALL be expressed by background tint and font weight, never by an accent rule on the left edge.

#### Scenario: Switching documents from the rail
- **WHEN** the user clicks a document in the rail or moves with the arrow keys
- **THEN** that document SHALL become active and its saved scroll position SHALL be restored

#### Scenario: Reordering
- **WHEN** the user drags a rail row onto another row
- **THEN** the dragged document SHALL move in front of that row

#### Scenario: Long file names
- **WHEN** a file name does not fit the rail width
- **THEN** it SHALL be truncated with an ellipsis and the full path SHALL be available as a tooltip

### Requirement: Fixed Measure With Margin Column
The app SHALL render the document at a maximum measure of 680px and SHALL use surplus window width for a margin column containing the live card, the document outline, outgoing links and file facts (path, modified time, word count, opened time).

#### Scenario: Wide window
- **WHEN** the window is at least 1140px wide
- **THEN** the margin column SHALL be visible beside the document and stay in view while scrolling

#### Scenario: Narrow window
- **WHEN** the window is narrower than 1140px
- **THEN** the margin column SHALL be hidden and the document measure SHALL be unchanged

#### Scenario: Outline navigation
- **WHEN** the user clicks an outline entry
- **THEN** the document SHALL scroll to that heading and the entry for the section being read SHALL be emphasised

### Requirement: Overlay Title Bar
The app SHALL use an overlay title bar so the rail extends to the top of the window, and the top of the rail and workspace SHALL act as window drag regions.

#### Scenario: Dragging the window
- **WHEN** the user drags the top strip of the window
- **THEN** the window SHALL move

### Requirement: Document-Only Selection
The app SHALL limit text selection to the rendered document, so Select All never includes rail, margin column, toast or other interface text.

#### Scenario: Select All
- **WHEN** the user presses ⌘A or chooses Edit → Select All
- **THEN** only the rendered Markdown document SHALL be selected

### Requirement: Live Card Placement
The app SHALL show the live state of the active document in a card at the top of the margin column, with the three most recent reloads and an "All reloads" action, and SHALL pin that card to the bottom of the rail when the margin column is not shown.

#### Scenario: Narrow window
- **WHEN** the window is too narrow for the margin column
- **THEN** the live card SHALL appear at the bottom of the rail, above the footer

### Requirement: Scroll Ownership
The window body SHALL never scroll. Only document panes SHALL scroll and clip their content, the chrome above them SHALL be opaque, and its lower edge SHALL gain a soft shadow only while the pane is scrolled.

#### Scenario: Scrolled document
- **WHEN** the reader scrolls a document down
- **THEN** no document text SHALL be visible through the chrome and the chrome edge SHALL show a shadow

### Requirement: Find In Document
The app SHALL let the user search the active document with ⌘F, highlight every match, show the position and number of matches, and step through them with Enter and Shift+Enter.

#### Scenario: No matches
- **WHEN** the query does not occur in the document
- **THEN** the find bar SHALL say so and nothing SHALL be highlighted

### Requirement: Interface Strings
All interface copy SHALL come from a single string table so the interface can be localised later; document content SHALL never be altered.

#### Scenario: Counted strings
- **WHEN** a count is shown, such as "1 change" or "3 changes"
- **THEN** the singular or plural form SHALL be selected through the string table

### Requirement: Text Zoom
The app SHALL let the user scale the document text from the View menu and with ⌘+ (also ⌘=), ⌘- and ⌘0, in steps of 10% between 50% and 300%, where ⌘0 resets to 100%. Text zoom SHALL NOT scale the rail, the margin column or the reading measure, and SHALL persist across launches.

#### Scenario: Make text bigger
- **WHEN** the user presses ⌘+ at 100%
- **THEN** the document text SHALL render at 110% while the rail and the 680px measure stay unchanged

#### Scenario: Reset
- **WHEN** the user presses ⌘0
- **THEN** the document text SHALL return to 100%
