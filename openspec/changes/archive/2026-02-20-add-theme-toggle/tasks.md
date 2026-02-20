## 1. Implementation
- [x] 1.1 Replace `@media (prefers-color-scheme: dark)` CSS blocks with `html[data-theme="dark"]` selectors in `styles.css`
- [x] 1.2 Add toggle switch styles to `styles.css`
- [x] 1.3 Add toggle switch element to `index.html` inside `.metadata-right`
- [x] 1.4 Add theme initialization logic to `renderer.ts` (read localStorage, apply data-theme attribute, default to light)
- [x] 1.5 Wire up toggle click handler (flip theme, persist to localStorage, update DOM)
- [x] 1.6 Build and verify end-to-end
