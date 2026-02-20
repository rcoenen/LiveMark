# theme-toggle Specification

## Purpose
TBD - created by archiving change add-theme-toggle. Update Purpose after archive.
## Requirements
### Requirement: Theme Toggle Switch
The app SHALL display a flip switch toggle in the sticky metadata header that allows users to switch between light and dark mode independently of macOS system appearance.

#### Scenario: Default theme on first launch
- **WHEN** the app is launched for the first time (no stored preference)
- **THEN** the app SHALL render in light mode (white background, dark text)

#### Scenario: Toggle to dark mode
- **WHEN** the user clicks the theme toggle while in light mode
- **THEN** the app SHALL immediately switch to dark mode (dark background, light text)

#### Scenario: Toggle to light mode
- **WHEN** the user clicks the theme toggle while in dark mode
- **THEN** the app SHALL immediately switch to light mode (white background, dark text)

### Requirement: Theme Persistence
The app SHALL persist the user's theme choice in localStorage so it survives app restarts.

#### Scenario: Theme restored on relaunch
- **WHEN** the user sets dark mode and relaunches the app
- **THEN** the app SHALL open in dark mode without any flash of the wrong theme

#### Scenario: Light mode persists on relaunch
- **WHEN** the user sets light mode and relaunches the app
- **THEN** the app SHALL open in light mode

### Requirement: System Appearance Independence
The app SHALL NOT follow macOS system appearance settings for theme selection.

#### Scenario: System dark mode does not affect app theme
- **WHEN** the user's macOS is set to dark mode but the app preference is light
- **THEN** the app SHALL render in light mode

#### Scenario: System light mode does not affect app theme
- **WHEN** the user's macOS is set to light mode but the app preference is dark
- **THEN** the app SHALL render in dark mode

