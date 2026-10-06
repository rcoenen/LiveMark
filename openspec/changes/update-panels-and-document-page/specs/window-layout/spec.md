## ADDED Requirements
### Requirement: Document Page
The app SHALL render each open document as a page: a sheet with a hairline ring, a soft drop shadow and a rounded corner, set on a workspace background that differs from both the page and the side panels. The reading measure inside the page SHALL stay 680px.

#### Scenario: Light theme
- **WHEN** a document is shown in the light theme
- **THEN** the page SHALL be white on a grey workspace, separated from the rail and the right panel by its ring and shadow

#### Scenario: Printing
- **WHEN** the user exports the document as a PDF
- **THEN** the page ring, shadow and background SHALL NOT appear in the output

### Requirement: Task-Based Panels
The rail SHALL hold navigation: the documents list and, by default, the "On this page" outline. A right panel docked to the full window height SHALL hold activity and facts: "Changes" at the top, "Links out to" below it and file facts pinned to the bottom. The right panel SHALL be shown only when the window is at least 1141px wide, a document is open and the window is not split.

#### Scenario: Wide window
- **WHEN** a document is open in a single pane and the window is at least 1141px wide
- **THEN** the outline SHALL be in the rail and the Changes section SHALL be at the top of the right panel

#### Scenario: Right panel unavailable
- **WHEN** the right panel cannot be shown because the window is narrow or split
- **THEN** sections placed in the right panel SHALL appear in the rail instead

### Requirement: Collapsible Panel Sections
Each panel section SHALL have a header that collapses and expands it. A collapsed Changes section SHALL keep showing the change count and a collapsed outline SHALL keep showing the current section. Collapsed state SHALL persist across launches.

#### Scenario: Collapse Changes
- **WHEN** the user collapses the Changes section of a document with 10 changes
- **THEN** only its header SHALL remain, showing the live dot and "10"

### Requirement: Movable Panel Sections
The user SHALL be able to move the Changes and "On this page" sections between the rail and the right panel by dragging the section header onto the other panel, or by activating the section's grip button, which SHALL also work from the keyboard. Placement SHALL persist across launches.

#### Scenario: Drag to the other panel
- **WHEN** the user drags the Changes header onto the rail
- **THEN** the rail SHALL show a drop target while dragging, and after the drop the Changes section SHALL appear in the rail

#### Scenario: Keyboard move
- **WHEN** the user focuses the grip of "On this page" in the rail and presses Enter
- **THEN** the section SHALL move to the right panel

### Requirement: Hideable Panels
The user SHALL be able to hide the docked rail, which then folds into the "Documents" tab, and the right panel, which then folds into a narrow strip showing the live state and change count. Activating the tab or the strip SHALL show the panel again. Both choices SHALL persist across launches.

#### Scenario: Hide the right panel
- **WHEN** the user hides the right panel
- **THEN** the document SHALL gain the width and a strip SHALL show the change count; clicking the strip SHALL restore the panel

#### Scenario: App controls while the rail is folded
- **WHEN** the rail is folded, by the user or because the window is narrow
- **THEN** a bar in the bottom-left corner SHALL show the app version, a light/dark control and any update status

### Requirement: Scrolled Location In Title Bar
Once the reader has scrolled the active document past its opening, the title bar SHALL show the file name and the current section, and SHALL clear them again at the top of the document.

#### Scenario: Deep in a document
- **WHEN** the reader scrolls a single-pane document past its title
- **THEN** the title bar SHALL read the file name followed by the current section heading
