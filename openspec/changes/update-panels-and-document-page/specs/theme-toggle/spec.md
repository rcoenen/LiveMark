## MODIFIED Requirements
### Requirement: Theme Toggle Switch
The app SHALL display a flip switch toggle in the footer of the documents rail that allows users to switch between light and dark mode independently of macOS system appearance. While the rail is folded, a light/dark button in the bottom-left bar SHALL do the same.

#### Scenario: Default theme on first launch
- **WHEN** the app is launched for the first time (no stored preference)
- **THEN** the app SHALL render in light mode (white background, dark text)

#### Scenario: Toggle to dark mode
- **WHEN** the user clicks the theme toggle while in light mode
- **THEN** the app SHALL immediately switch to dark mode (dark background, light text)

#### Scenario: Toggle to light mode
- **WHEN** the user clicks the theme toggle while in dark mode
- **THEN** the app SHALL immediately switch to light mode (white background, dark text)

#### Scenario: Toggle while the rail is folded
- **WHEN** the rail is folded and the user clicks the light/dark button in the bottom-left bar
- **THEN** the app SHALL switch theme and the rail switch SHALL show the same state
