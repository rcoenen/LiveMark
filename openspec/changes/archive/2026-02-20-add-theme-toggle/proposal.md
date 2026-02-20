# Change: Add built-in light/dark mode toggle

## Why
LiveMark currently follows macOS system appearance, giving users no in-app control over the theme. Users want to choose light or dark mode independently of their system setting, and have that choice remembered across sessions.

## What Changes
- Remove `prefers-color-scheme` media query dependency
- Add a flip switch toggle to the sticky metadata header
- Persist the user's theme choice in localStorage across sessions
- Default to light mode on first launch

## Impact
- Affected specs: none (no existing specs)
- Affected code: `src/renderer/styles.css`, `index.html`, `src/renderer/renderer.ts`
