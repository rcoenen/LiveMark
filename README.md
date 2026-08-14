<div align="center">
  <img src="build/icon-readme.jpg" alt="LiveMark logo" width="128">
  <h1>LiveMark</h1>
  <p>Keep an eye on what your coding agent is doing to your Markdown files.</p>
</div>

<p align="center">
  <a href="https://github.com/rcoenen/LiveMark/releases/latest"><img alt="Download the DMG" src="https://img.shields.io/github/v/release/rcoenen/LiveMark?sort=semver&amp;display_name=tag&amp;style=for-the-badge&amp;label=download%20the%20dmg&amp;color=7C3AED"></a>
  <a href="https://github.com/rcoenen/LiveMark/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/rcoenen/LiveMark/total?style=for-the-badge&amp;label=downloads&amp;color=2C7BE5"></a>
  <a href="https://github.com/rcoenen/LiveMark/actions/workflows/ci.yml"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/rcoenen/LiveMark/ci.yml?branch=main&amp;style=for-the-badge&amp;label=build"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/rcoenen/LiveMark?style=for-the-badge&amp;label=license"></a>
</p>

LiveMark renders local Markdown files and refreshes the preview whenever they change on disk. Open several documents in tabs and keep their previews running side by side.

## Install

1. **[Download the latest DMG](https://github.com/rcoenen/LiveMark/releases/latest).**
2. Open it and drag LiveMark into Applications.
3. Try to open LiveMark once. macOS will block the first launch because the app
   is not notarized.
4. Open **System Settings → Privacy & Security**, scroll to **Security**, and
   click **Open Anyway** next to LiveMark.
5. Confirm **Open**, then open a Markdown file.

> LiveMark is ad-hoc signed but not Apple-notarized. The one-time **Open Anyway**
> step is required because notarization requires a paid Apple Developer account.
> Apple has enough money already; we're not paying them to remove one click.

## Why LiveMark?

I built LiveMark for myself to improve observability in my coding workflows. Coding agents generate and update a lot of Markdown files, and I wanted a simple way to keep an eye on those changes as they happen. I needed this tool after MacDown was retired. Although MacDown worked through Rosetta, it was never updated to run natively on Apple silicon.

## Features

- Live preview on every file save
- Multiple independently updating document tabs
- GitHub-flavored Markdown and syntax highlighting
- Light and dark themes
- Selection-aware copy as Markdown
- Finder, drag-and-drop, Open dialog, and CLI support

## CLI

Install the `livemark` command from the LiveMark application menu, then open one or more files:

```sh
livemark README.md notes.md
```

## Develop

```sh
npm install
npm start
```
