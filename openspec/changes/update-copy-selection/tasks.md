## 1. Implementation
- [x] 1.1 Install `turndown` and `@types/turndown`
- [x] 1.2 Import and configure TurndownService in `renderer.ts`
- [x] 1.3 Update the copy event handler to check for an active selection within `.content`
- [x] 1.4 If selection exists: extract selected HTML fragment, convert to markdown via turndown, copy result
- [x] 1.5 If no selection: fall back to full raw markdown source (existing behavior)
- [x] 1.6 Build and verify end-to-end
