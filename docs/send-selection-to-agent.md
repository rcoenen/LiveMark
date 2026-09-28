# Send a selection to a coding agent

Notes from 2026-09-28. Not a spec and not scheduled. Protocols move; recheck the links before building.

## Idea

While a coding agent drafts a Markdown file and LiveMark shows it live, select a passage in LiveMark and send it into the session that is already open. A right-click or shortcut, plus one instruction line ("schrap de laatste zin"). The selection, the instruction, and the file path go together.

A bare paragraph is not enough. Without an instruction the agent decides for itself what to do with it.

Do not start a new session. `claude -p`, `grok -p`, and `codex exec` throw away the thread that already has the context. Do not press Enter for the user. In a session with permissions bypassed, an accidental send goes straight to work.

## What LiveMark already has

A selection already becomes Markdown on the clipboard. Full-document copy uses the file source. A smaller selection is reconstructed from the rendered HTML (`src/renderer/copy-markdown.ts`, `copyTarget()` in `src/renderer/renderer.ts`).

That reconstructed text is enough to quote the words. It is not enough to say "edit this exact paragraph", because the same sentence can appear twice. Mapping the rendered selection back to a source span is the real work inside LiveMark. The transport is the smaller part.

## Who can receive a push

A push means another program on this Mac can put a message into the session without pasting keystrokes into the terminal. Checked 2026-09-28.

| Agent | Reaches the session already in the terminal? | Door |
| --- | --- | --- |
| Claude Code | Yes | Per-session inbox socket. Any local process can post. See [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging). |
| OpenCode v2 | Yes, through its background server | TUI and web UI share a server, default `127.0.0.1:49374`, password protected. `POST /api/session/{id}/prompt` admits a message. `GET /api/session/active` lists foreground sessions. See [server](https://opencode.ai/docs/server/) and [v2 API](https://opencode.ai/v2/docs/api/). |
| Kimi Code | Only for a web or wire session | `kimi web` listens on `127.0.0.1:58627`. `POST /api/v1/sessions/{id}/prompts` starts a turn. `kimi --wire` speaks JSON-RPC on stdin, including `prompt` and `steer`. See [wire mode](https://moonshotai.github.io/kimi-cli/en/customization/wire-mode.html) and [server API](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/server-api.html). |
| Codex | Only if started as a server | `codex app-server` has `turn/start` and `turn/steer`. The TUI must be connected with `codex --remote`. A request to inject into a normal TUI was closed. |
| Qwen Code | Experimental | `qwen serve` is a daemon clients attach to. Marked experimental. |
| Grok, Amp, Copilot CLI, Cursor CLI, Aider | No | MCP and plugins add tools the agent calls. They do not open a door into the window that is already running. |

### Claude

Two official doors.

- **Inbox socket.** Each session binds a Unix socket under `/tmp/cc-socks-<uid>/`. `/status` shows it as Peer address (`uds:`). Hooks see `CLAUDE_CODE_MESSAGING_SOCKET`. On macOS an auth line is optional. A message that arrives while the session is busy is read between tool calls. An idle session starts a new turn. A poster that is not a child of that session is held for approval when the session bypasses permission prompts, unless `crossSessionInbound` is `accept`. Holding is the better default.
- **Channel.** An MCP server that declares `claude/channel` can push events into the session. Telegram and Discord work this way. A custom channel is still a research preview and loads with `--dangerously-load-development-channels`. The socket does the same job without that flag. See [channels reference](https://code.claude.com/docs/en/channels-reference).

The socket is the one to build against. LiveMark lists the live sockets, the user picks the session once, and LiveMark remembers it.

### OpenCode

The strongest second target, on v2. The IDE plugins already drive the TUI through the server (`POST /tui/append-prompt` fills the composer, `POST /tui/submit-prompt` sends it). Appending without submitting matches "leave it in the box".

An older `opencode` that was not started with a published port talks to itself over an internal worker and is not reachable. A second `opencode serve` beside a running TUI is a new server, not a door into that tab.

### Kimi

The protocol is real. The ordinary `kimi` tab does not listen. Wire mode replaces the terminal UI, so LiveMark would be the client. `/web` from inside the TUI hands the session to the browser or starts a server after the TUI exits. Moonshot keeps the TUI at one live session per process. The process that hosts many sessions is `kimi web`.

### Codex and Grok

Same shape as Kimi's terminal: the push API exists only for a session born as a server (`codex app-server`, `grok agent stdio`). The window opened with `codex` or `grok` is not on that API. Grok's ACP client owns the session. Loading the chat the TUI already has open from a second process is the wrong move.

## Fallback that was set aside

Ghostty can paste into a terminal with AppleScript `input text` and does not press Enter. iTerm has `write text`. That covers every agent and was set aside: it is a third-party paste, it can land in a dialog, and it needs the right window. tmux `send-keys` is the same idea.

## If this gets built

1. Claude socket first. One menu item on a selection. A one-line instruction field. Quote, path, and instruction in one message. Remember the chosen session.
2. OpenCode v2 next, against the background server, append first and submit only when the user asks.
3. Leave Kimi, Codex, and Qwen until someone actually works in their server mode.
4. Resolve the selection to a source span before telling the agent to edit the file.
