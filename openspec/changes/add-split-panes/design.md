## Context
The renderer is a single closure over one content element and window-level scroll. Two panes need two independent instances of: rendered DOM, scroll container, scroll-spy, mark timers, scroll anchoring.

## Goals / Non-Goals
- Goals: two independent panes; no regression in single-pane mode; no backend protocol change.
- Non-Goals: synced scrolling, more than two panes, editing.

## Decisions
- Extract a `DocumentPane` class owning one scroll container (`overflow-y: auto`) and the functions that today read `contentEl` / `window.scroll*`: render, image resolution, marks, anchors, scroll-spy.
  - Single-pane mode uses the same class with one instance, so there is one code path. Alternative considered: keep window scrolling for single-pane and containers for split — rejected, two scroll models double the anchoring bugs.
- Document state (`OpenDocument`) stays global; `scrollTop` moves to a per-pane map so the same document can sit in both panes.
- Focused pane = last pane that received pointer or keyboard focus; copy, ⌘⇧N, status block and window title follow it.
- Send-to-pane works through context menu and keyboard first; drag-and-drop is an enhancement gated on the WKWebView check.

## Risks / Trade-offs
- Moving from window scroll to container scroll changes overlay-titlebar behaviour and rubber-banding → verify in the packaged app early.
- Large diff in `renderer.ts` conflicts with other open changes → land after them.

## Open Questions
- Should two-pane mode persist across launches?
- Minimum window width to allow splitting (proposal: 1180px).
