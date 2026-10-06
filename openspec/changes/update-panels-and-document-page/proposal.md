# Change: Document page, task-based panels and reachable app controls

## Why
The rendered document sits directly on the window background, so nothing separates it from the chrome around it. The margin column mixes three different jobs (live changes, navigation and file facts) in one floating stack, while the rail leaves most of its height empty. On a narrow window the version, the theme switch and the update banner are hard or impossible to reach.

Design source: Claude Design canvas "LiveMark Reader Mockup" (artboards "Reader · panels open", "Compact · panels collapsed", the two dark artboards, "Several documents open" and "Scrolled deep into a document").

## What Changes
- Render the document as a page: a sheet with a hairline ring, a soft drop shadow and an 8px radius, on a workspace background one step darker than the side panels in light mode and one step darker than the page in dark mode.
- Split the margin column by job. The left rail is for getting around: documents, then "On this page". The right panel, now docked full-height with a hairline edge like the rail, is for what is happening: "Changes" at the top, "Links out to" below it, file facts pinned to the bottom.
- Every panel section has a header with a chevron that collapses it, and the collapsed header keeps a summary: the change count for Changes, the current section for On this page.
- "Changes" and "On this page" can be dragged between the two panels by their header, or sent to the other panel by clicking the grip, which is also the keyboard path. Placement and collapsed state persist across launches.
- Both panels can be hidden. The rail folds into the existing "Documents" tab. The right panel folds into a 44px strip showing the live dot and the change count, and clicking the strip opens it again.
- While the rail is folded, a small bar in the bottom-left corner keeps the version, a light/dark button and the update status in reach.
- The app update banner moves from a floating toast into the rail footer, above the version and the theme switch.
- Once the document title has scrolled away, the title bar shows the file name and the current section.
- Reload log rows become buttons that jump to that reload.

## Impact
- Affected specs: `window-layout` (added requirements; supersedes "Fixed Measure With Margin Column" and "Live Card Placement" from the pending change `update-window-layout-and-reload-feedback`), `app-updates` (added requirement), `theme-toggle` (modified)
- Affected code: `index.html`, `src/renderer/styles.css`, `src/renderer/renderer.ts`, `src/renderer/pane.ts`, `src/renderer/rail-width.ts`, `src/renderer/strings.ts`
- Release: ships as a patch release (1.6.5).
