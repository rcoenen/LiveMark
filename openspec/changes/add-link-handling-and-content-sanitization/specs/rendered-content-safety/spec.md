## ADDED Requirements
### Requirement: Link Handling
The app SHALL never navigate its own webview away from the application. External links SHALL open in the default browser, links to local Markdown files SHALL open as documents, and fragment links SHALL scroll within the current document.

#### Scenario: External link
- **WHEN** the user clicks an `https://` link
- **THEN** the URL SHALL open in the default browser and the document SHALL remain displayed

#### Scenario: Relative Markdown link
- **WHEN** the user clicks a link to `docs/other.md`
- **THEN** that file SHALL open as a document in the rail, resolved relative to the current document

#### Scenario: Forced navigation
- **WHEN** rendered content attempts to navigate the webview by any other means
- **THEN** the navigation SHALL be denied

### Requirement: Sanitised Rendering
The app SHALL sanitise rendered Markdown before display, removing scripts, styles, meta, base, form, frame and object elements, event-handler attributes and `javascript:` URLs.

#### Scenario: Style injection
- **WHEN** a document contains `<style>body{display:none}</style>`
- **THEN** the application UI SHALL be unaffected

### Requirement: Remote Images
The app SHALL load images referenced by `http://` or `https://` URLs.

#### Scenario: Remote badge image
- **WHEN** a document contains `![build](https://example.com/badge.svg)`
- **THEN** the image SHALL be displayed

### Requirement: Local Image Resolution
The app SHALL load local images whose paths contain spaces or non-ASCII characters, and SHALL only read image files inside the repository that contains the referencing document, or inside the document's own directory tree when it is not part of a repository.

#### Scenario: Encoded file name
- **WHEN** a document references `![a](<my image.png>)`
- **THEN** the image SHALL be displayed

#### Scenario: Shared assets folder in a repository
- **WHEN** `docs/guide/page.md` inside a Git repository references `../assets/diagram.png`
- **THEN** the image SHALL be displayed

#### Scenario: Path outside the document tree
- **WHEN** a document that is not in a repository references `../../secret.png` outside its directory tree
- **THEN** the image SHALL NOT be read

### Requirement: Open Errors Are Visible
The app SHALL tell the user when a file cannot be opened, and SHALL render files that start with a UTF-8 byte-order mark correctly.

#### Scenario: BOM before a heading
- **WHEN** a file starts with a BOM followed by `# Title`
- **THEN** the first block SHALL render as a heading
