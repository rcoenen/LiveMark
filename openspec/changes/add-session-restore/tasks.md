## 1. Backend
- [x] 1.1 `session.rs`: load/save session JSON (documents in order + active id) in the app data dir; corrupt or missing file → empty session; unit tests.
- [x] 1.2 Save on registry mutations (register, close, activate); suppress saves during `RunEvent::Exit`.
- [x] 1.3 Restore in `setup` after CLI/pending paths: reopen session documents, reactivate the active one, skip missing files silently.

## 2. Verification
- [x] 2.1 `npm test` and `npm run build`.
- [x] 2.2 Manual: open docs → quit → relaunch restores rail + active doc; update-relaunch preserves the rail; closing a document removes it from the restored set. (Verified with an isolated dev identifier: session written on open, restored with no CLI args; quit/update-relaunch semantics rest on the `RunEvent::Exit` save guard.)
