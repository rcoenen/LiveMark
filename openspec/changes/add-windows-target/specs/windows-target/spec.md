## ADDED Requirements

### Requirement: One product and one version
LiveMark SHALL build Windows from the same repository, the same `src-tauri` tree, and the same frontend as macOS. A published version SHALL use one version number and SHALL publish two download tags: `<version>-MAC` and `<version>-WIN`. The Mac tag holds the macOS artifacts. The Windows tag holds both NSIS installers.

#### Scenario: Each platform has its own tag
- **WHEN** version 1.6.4 is published
- **THEN** the Mac DMG SHALL be on the GitHub Release `1.6.4-MAC`
- **AND** `LiveMark-<version>-win-x64-setup.exe` and `LiveMark-<version>-win-arm64-setup.exe` SHALL be on the GitHub Release `1.6.4-WIN`
- **AND** neither release SHALL contain a 32-bit installer

#### Scenario: Updater lists both Windows architectures
- **WHEN** `latest.json` is published
- **THEN** the Windows platform keys SHALL be `windows-x86_64` and `windows-aarch64`
- **AND** their URLs SHALL point at `LiveMark-<version>-win-x64-setup.exe` and `LiveMark-<version>-win-arm64-setup.exe` on the `<version>-WIN` tag

#### Scenario: No second source tree
- **WHEN** the Windows target is built
- **THEN** platform differences SHALL be selected by conditional compilation or bundle configuration inside the existing tree

### Requirement: Per-user NSIS install
The Windows distribution SHALL be an NSIS installer for the current user. It SHALL install without administrator privileges, SHALL create a Start Menu shortcut, SHALL register the Markdown file associations, and SHALL include an uninstaller. The build SHALL NOT require an Authenticode certificate.

#### Scenario: Install without administrator
- **WHEN** a user runs the NSIS installer without an administrator account
- **THEN** LiveMark SHALL be installed under the current user's local app data and SHALL launch

#### Scenario: Explorer opens a Markdown file
- **WHEN** a user double-clicks a `.md` or `.markdown` file after installation
- **THEN** LiveMark SHALL display that file, focusing the already running instance when one exists
- **AND** that association SHALL replace a previous per-user default for those extensions

#### Scenario: WebView2 missing
- **WHEN** the installer runs on a machine without the WebView2 runtime
- **THEN** the installer SHALL download the Evergreen bootstrapper and install the runtime

### Requirement: Packaged builds become the default Markdown app
A packaged install SHALL make LiveMark the current user's default application for `.md` and `.markdown` files. The Windows installer SHALL do this during installation. The packaged macOS app SHALL do this on its first launch. A development build SHALL NOT change the default application. After that first claim, a choice the user makes later SHALL be left as it is.

#### Scenario: Finder double-click after the first launch
- **WHEN** a user has launched the packaged macOS app once and then double-clicks a `.md` file
- **THEN** LiveMark SHALL open that file

#### Scenario: Development build leaves the default alone
- **WHEN** a development build starts
- **THEN** the system default application for `.md` files SHALL stay unchanged

### Requirement: Windows direct updates
A release build installed by the NSIS installer SHALL be classified as a direct install. The in-app updater SHALL download the matching `windows-x86_64` or `windows-aarch64` artifact from the existing `latest.json` endpoint, verify its minisign signature, and run it. A Homebrew-managed macOS install SHALL NOT install updates itself. A development build SHALL NOT run an automatic update check.

#### Scenario: Direct Windows install applies an update
- **WHEN** a directly installed Windows copy finds a newer version and the user confirms
- **THEN** the app SHALL verify the signed Windows artifact and run the installer

#### Scenario: Manifest lists both platforms
- **WHEN** a release is published
- **THEN** `latest.json` SHALL contain a `darwin-aarch64` entry and both `windows-x86_64` and `windows-aarch64` entries for that version

#### Scenario: Homebrew install stays instruction-only
- **WHEN** a Homebrew-installed macOS copy finds a newer version
- **THEN** the app SHALL offer the Homebrew upgrade command and SHALL NOT install the update itself

#### Scenario: Development build
- **WHEN** the app runs as a development build on Windows
- **THEN** no automatic update check SHALL be performed

### Requirement: Live preview on Windows
Opening a supported document on Windows SHALL render it and refresh the preview after the file changes on disk. Path comparison SHALL treat drive-letter case differences and the `\\?\` extended prefix as the same file. An atomic replace in a watched directory SHALL refresh the open documents there.

#### Scenario: Save refreshes the preview
- **WHEN** an open document is saved in place or replaced atomically
- **THEN** the preview SHALL show the new contents

#### Scenario: Same file, different path spelling
- **WHEN** the same file is addressed with different casing or an extended-length prefix
- **THEN** LiveMark SHALL keep a single document and SHALL match filesystem events to it

### Requirement: macOS-only chrome stays on macOS
On Windows the menu SHALL NOT contain Services, Hide, Hide Others, Show All, or Bring All to Front. Check for Updates and Install CLI Command SHALL remain. Closing the window on Windows SHALL exit the process and SHALL leave session restore intact. Closing the window on macOS SHALL hide the app so the Dock can reopen it. Visible shortcut labels on Windows SHALL use Ctrl. The Windows window SHALL use the native title bar without the macOS traffic-light inset.

#### Scenario: Windows menu
- **WHEN** the menu is shown on Windows
- **THEN** Services, Hide, Hide Others, Show All, and Bring All to Front SHALL be absent
- **AND** Check for Updates and Install CLI Command SHALL be present

#### Scenario: Windows close quits
- **WHEN** the user closes the window on Windows
- **THEN** the process SHALL exit
- **AND** the next launch SHALL restore the previous session

#### Scenario: macOS close hides
- **WHEN** the user closes the window on macOS
- **THEN** the app SHALL hide and SHALL reopen when the Dock icon is clicked

#### Scenario: Shortcut labels
- **WHEN** shortcut hints are shown on Windows
- **THEN** they SHALL name the Ctrl modifier

### Requirement: Windows CLI without administrator
The Install CLI Command action on Windows SHALL install a `livemark` command for the current user without an administrator prompt. Running that command with a document path SHALL open the document in LiveMark.

#### Scenario: Command installed for the current user
- **WHEN** the user chooses Install CLI Command on Windows
- **THEN** a new terminal SHALL be able to run `livemark` with a document path and LiveMark SHALL open that document

#### Scenario: macOS CLI path unchanged
- **WHEN** the user chooses Install CLI Command on macOS
- **THEN** the command SHALL be installed at `/usr/local/bin/livemark`

### Requirement: Shared icon
The Windows executable, NSIS installer, and Start Menu shortcut SHALL use `build/icon.ico` generated from `build/icon.png`.

#### Scenario: Icon file is the PNG export
- **WHEN** the Windows bundle is built
- **THEN** the bundle icon SHALL be `build/icon.ico` produced from `build/icon.png`

### Requirement: CI builds the installers
A pull request SHALL build the Windows NSIS installers on `windows-latest` from the same commit that builds the macOS app.

#### Scenario: Pull request build
- **WHEN** a pull request is built
- **THEN** the Windows jobs SHALL produce the x64 and arm64 NSIS installers and upload them as Actions artifacts
- **AND** that run SHALL NOT create a GitHub Release
- **AND** the macOS job SHALL still build the macOS app

### Requirement: Unsigned install is documented
The README SHALL describe the Mac installer and the Windows NSIS installer. The Windows instructions SHALL include the SmartScreen confirmation required to run the unsigned installer.

#### Scenario: README Windows install
- **WHEN** a user follows the Windows section of the README
- **THEN** the instructions SHALL name the NSIS installer and the SmartScreen "More info, run anyway" step

#### Scenario: README Mac install
- **WHEN** a user follows the Mac section of the README
- **THEN** the instructions SHALL still describe the DMG and Homebrew installs

### Requirement: README shows both packages and their download counts
The README header SHALL show a Mac download badge and a Windows download badge for the current version, plus a separate download count for each platform. The Mac count SHALL be the sum of downloads of `.dmg` assets across releases. The Windows count SHALL be the sum of downloads of `-setup.exe` assets across releases. Checksums, signatures, updater manifests, archives, and `install.sh` SHALL NOT be included in either count.

#### Scenario: Header names both installers
- **WHEN** the README is rendered
- **THEN** the header SHALL show a Mac download badge linking to `LiveMark-mac.dmg` on the latest release
- **AND** a Windows download badge linking to `LiveMark-win-x64-setup.exe` on the latest release
- **AND** the Windows install section SHALL name both `LiveMark-<version>-win-x64-setup.exe` and `LiveMark-<version>-win-arm64-setup.exe`

#### Scenario: Counts follow the packages
- **WHEN** the download badges are rendered
- **THEN** the Mac badge SHALL show the total downloads of `.dmg` assets
- **AND** the Windows badge SHALL show the total downloads of `-setup.exe` assets
