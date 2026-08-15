## ADDED Requirements

### Requirement: Tauri Desktop Runtime
The packaged macOS application SHALL use Tauri 2 with the system WKWebView and SHALL NOT bundle Electron, Chromium, or a Node.js runtime.

#### Scenario: Launch the packaged application
- **WHEN** the user launches the release-mode LiveMark application on a supported Apple-silicon Mac
- **THEN** the app SHALL open its existing viewer window through Tauri and render the packaged frontend using the system WKWebView

#### Scenario: Inspect the production bundle
- **WHEN** a release-mode application bundle is inspected
- **THEN** it SHALL contain the LiveMark Rust executable and frontend assets without Electron Framework, a bundled Chromium engine, a Node.js runtime, or Electron main/preload output

### Requirement: Native File-Open Integration
The Tauri application SHALL accept every currently supported document-open entry point and route all received paths through one validated document-registration flow.

#### Scenario: Open files at cold launch
- **WHEN** Finder, macOS file association handling, or the `livemark` CLI launches the app with one or more supported files
- **THEN** the app SHALL open every valid file as a document tab in delivery order and activate the last successfully opened document

#### Scenario: Open files while running
- **WHEN** Finder or a later `livemark` CLI process supplies one or more supported files while LiveMark is running
- **THEN** the existing LiveMark process SHALL receive the paths, show and focus its window, open each new document, and activate an existing tab for any duplicate canonical path

#### Scenario: Open files from the application window
- **WHEN** the user selects multiple files in the native Open dialog or drops multiple files on the webview
- **THEN** the app SHALL open every valid supported file through the same document-registration flow

#### Scenario: Reject an invalid open request
- **WHEN** an open source supplies a missing path, directory, unsupported file, or malformed command payload
- **THEN** the app SHALL reject that item without panicking, granting filesystem access, or disturbing documents that are already open

### Requirement: Reliable Runtime-Owned Document Watching
The Rust backend SHALL own document reads and logical watch registrations and SHALL deliver complete document-scoped snapshots after stable filesystem changes.

#### Scenario: Read an opened document
- **WHEN** a supported regular file is successfully registered
- **THEN** the backend SHALL read its current UTF-8 content and modification time and deliver one complete snapshot associated with that document

#### Scenario: Observe an in-place save
- **WHEN** an editor writes changes to an open document in place
- **THEN** the backend SHALL wait until the write is stable and deliver the latest complete snapshot to the correct document tab

#### Scenario: Observe an atomic replacement save
- **WHEN** an editor saves by replacing an open document with a temporary file at the same path
- **THEN** the backend SHALL continue watching the document path and deliver the replacement file's latest complete snapshot

#### Scenario: Release watch resources
- **WHEN** a document closes or the application exits
- **THEN** the backend SHALL release the document's logical watch registration and stop any underlying watcher that has no remaining documents

### Requirement: Least-Privilege Renderer Boundary
The webview SHALL communicate through an allowlisted Tauri command and event surface and SHALL NOT receive unrestricted filesystem, shell, or process access.

#### Scenario: Invoke an allowed document operation
- **WHEN** the renderer invokes an allowlisted open, activate, close, bootstrap, or local-asset operation with a valid payload
- **THEN** the Rust backend SHALL validate the request and perform only that operation

#### Scenario: Attempt an unapproved native operation
- **WHEN** webview content attempts to invoke an unapproved Tauri command or access a filesystem path outside the operation being validated
- **THEN** the Tauri capability and backend validation layers SHALL deny the request

#### Scenario: Render a relative local image
- **WHEN** an open Markdown document references a valid local image using a relative path
- **THEN** the app SHALL resolve and display the image through a backend-controlled asset mechanism without exposing a general file URL or filesystem API to the renderer

#### Scenario: Request an invalid local asset
- **WHEN** webview content requests a missing, malformed, unsupported, or non-image local asset
- **THEN** the backend SHALL reject the resource without reading or returning its contents

### Requirement: User-Visible Behavior Parity
Replacing the desktop runtime SHALL preserve the existing LiveMark document-viewing behavior except for a possible one-time reset of the stored theme preference on the first Tauri launch.

#### Scenario: Use existing viewer features
- **WHEN** the user renders Markdown, switches tabs, receives foreground or background updates, navigates or closes tabs, copies a selection or full document, toggles the theme, or returns to the empty state
- **THEN** the behavior and visible result SHALL match the corresponding Electron release behavior and all existing capability specifications

#### Scenario: Relaunch after choosing a theme in Tauri
- **WHEN** the user chooses a theme in the Tauri application and later relaunches it
- **THEN** the app SHALL restore that choice without a flash of the wrong theme

#### Scenario: Use native application commands
- **WHEN** the user invokes Open, Close Tab, Close Window, Copy, Select All, zoom, fullscreen, or standard macOS application/window commands
- **THEN** each command SHALL retain its existing shortcut and observable behavior

### Requirement: Compatible macOS Distribution
The Tauri release SHALL preserve LiveMark's application identity and supported installation workflows while producing app, DMG, archive, and checksum artifacts without the Electron runtime.

#### Scenario: Inspect release identity
- **WHEN** a release artifact is built
- **THEN** it SHALL retain the product name `LiveMark`, bundle identifier `com.livemark.app`, existing icons, Apple-silicon target, declared macOS support policy, and Markdown file associations

#### Scenario: Install from a release channel
- **WHEN** the user installs or upgrades LiveMark through the DMG, curl installer, or Homebrew cask
- **THEN** the workflow SHALL install the Tauri `LiveMark.app` and preserve the documented launch command and public artifact naming convention

#### Scenario: Use the bundled CLI
- **WHEN** the `livemark` symlink targets the CLI resource inside the installed Tauri application
- **THEN** `livemark [file ...]` SHALL launch or focus LiveMark and deliver every supplied valid file

#### Scenario: Verify a release artifact
- **WHEN** release automation packages LiveMark
- **THEN** it SHALL verify the application signature and DMG, publish SHA-256 checksums, and record app, DMG, archive, startup, and idle-memory comparisons with the Electron baseline

### Requirement: Application Version Display
The app SHALL display its runtime package version next to the LiveMark name in the persistent application toolbar.

#### Scenario: View the application version
- **WHEN** the LiveMark window finishes loading
- **THEN** the toolbar SHALL show the version reported by the packaged application in a compact secondary style next to the LiveMark title

#### Scenario: Build a new release version
- **WHEN** the package version changes and a new application is built
- **THEN** the toolbar version SHALL update from that package version without a separate hardcoded renderer value
