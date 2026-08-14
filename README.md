<div align="center">
  <img src="build/icon-readme.jpg" alt="LiveMark logo" width="128">
  <h1>LiveMark</h1>
  <p>Keep an eye on what your coding agent is doing to your Markdown files.</p>
</div>

LiveMark renders local Markdown files and refreshes the preview whenever they change on disk. Open several documents in tabs and keep their previews running side by side.

## Why LiveMark?

I built LiveMark for myself to improve observability in my coding workflows. Coding agents generate and update a lot of Markdown files, and I wanted a simple way to keep an eye on those changes as they happen. I needed this tool after MacDown was retired. Although MacDown worked through Rosetta, it was never updated to run natively on Apple silicon.

## Features

- Live preview on every file save
- Multiple independently updating document tabs
- GitHub-flavored Markdown and syntax highlighting
- Light and dark themes
- Selection-aware copy as Markdown
- Finder, drag-and-drop, Open dialog, and CLI support

## Run from source

Requires Node.js and macOS.

```sh
npm install
npm start
```

## Build the macOS installer

```sh
npm run dist
```

The DMG and ZIP are written to `dist/`.

## CLI

Install the `livemark` command from the LiveMark application menu, then open one or more files:

```sh
livemark README.md notes.md
```
