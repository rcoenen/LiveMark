## Why
Open documents live only in memory. Any restart — including the new update-and-relaunch flow — wipes the rail, so users lose their workspace exactly when the app updates.

## What Changes
- The app persists the open document list (paths in rail order) and the active document to a session file in the app data directory, updated whenever the registry changes.
- On launch, the app reopens the persisted documents and reactivates the previously active one. Files that no longer exist are skipped silently.
- Documents passed on the command line or via file-open events merge with (take precedence over) the restored session.
- Quitting does not erase the session; explicitly closing documents does.

## Feasibility
| Part | Verdict | Notes |
|---|---|---|
| Persist rail + active doc | Can be done | Small JSON in `app_data_dir`; registry already tracks order and active id. |
| Restore on launch | Can be done | Reuse `register_document`; duplicates (CLI args) no-op by design. |
| Quit vs close semantics | Needs care | `RunEvent::Exit` closes all documents; session writes must be suppressed during shutdown or the file would be emptied on every quit/update. |

## Impact
- Affected specs: `session-restore` (new)
- Affected code: `src-tauri/src/session.rs` (new), `src-tauri/src/lib.rs`
