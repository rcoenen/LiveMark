## ADDED Requirements
### Requirement: Update Notice Placement
The update notice SHALL appear in the rail footer, above the app version and the theme switch, instead of floating over the document. While the rail is folded, the bottom-left bar SHALL show the notice's title, and activating it SHALL open the rail.

#### Scenario: Update available with the rail docked
- **WHEN** an update is found and the rail is docked
- **THEN** the notice SHALL appear in the rail footer with its actions, release notes link and dismiss control

#### Scenario: Update available with the rail folded
- **WHEN** an update is found and the rail is folded
- **THEN** the bottom-left bar SHALL show the notice's title, and activating it SHALL open the rail
