## ADDED Requirements
### Requirement: Update Check
The app SHALL check the latest published GitHub Release for a newer version shortly after startup and when the user chooses "Check for Updates…" from the app menu.

#### Scenario: Startup check in a development build
- **WHEN** the app runs as a development build
- **THEN** no automatic update check SHALL be performed

#### Scenario: Startup check failure
- **WHEN** the automatic update check fails (for example, the machine is offline)
- **THEN** the failure SHALL be silent and the app SHALL continue normally

#### Scenario: Manual check reports every outcome
- **WHEN** the user chooses "Check for Updates…"
- **THEN** the app SHALL report whether an update is available, the app is up to date, or the check failed

### Requirement: Direct-Install Update
For installations that are not managed by Homebrew, the app SHALL offer to download the update, verify its signature, install it in place, and relaunch.

#### Scenario: User accepts the update
- **WHEN** a directly-installed copy shows an available update and the user confirms
- **THEN** the app SHALL download and verify the update artifact, install it, and offer or perform a relaunch

#### Scenario: Install fails
- **WHEN** the download, verification, or install step fails
- **THEN** the app SHALL report the failure and offer a link to the release page instead

### Requirement: Homebrew-Managed Installations
For installations under a Homebrew Caskroom, the app SHALL NOT download or install updates itself; it SHALL direct the user to `brew upgrade --cask livemark`.

#### Scenario: Update available for a brew install
- **WHEN** a Homebrew-installed copy shows an available update
- **THEN** the banner SHALL offer to copy the `brew upgrade --cask livemark` command and a link to the release notes, with no in-app install action

### Requirement: Release Publishes Updater Artifacts
Each published GitHub Release SHALL include the signed updater artifact (`*.app.tar.gz` with its `.sig`) and a `latest.json` manifest referencing them for the `darwin-aarch64` platform.

#### Scenario: Release workflow completes
- **WHEN** the release workflow packages a version
- **THEN** the release SHALL contain the DMG, zip, checksums, signed updater artifact, and `latest.json`
