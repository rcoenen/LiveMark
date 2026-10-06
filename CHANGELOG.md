# Changelog

## [1.6.5](https://github.com/rcoenen/LiveMark/compare/v1.6.4...v1.6.5) (2026-10-06)


### Bug Fixes

* show the document as a page and split the side panels by task ([107a8c0](https://github.com/rcoenen/LiveMark/commit/107a8c05d77a365d1315cf10b5f50af38e688ece))
* show the document as a page and split the side panels by task ([3c01981](https://github.com/rcoenen/LiveMark/commit/3c019810892715a716aebb0de7535d765a445104))

## [1.6.4](https://github.com/rcoenen/LiveMark/compare/v1.6.3...v1.6.4) (2026-10-04)


### Features

* build LiveMark for Windows from the same tree ([d52f6ab](https://github.com/rcoenen/LiveMark/commit/d52f6ab95b508ad432567f6b2e5c6bcb37104aba))


### Bug Fixes

* export as PDF and ship Mac and Windows together ([058e89d](https://github.com/rcoenen/LiveMark/commit/058e89d1c2dbc6488029803d70246c27ab1ca9dd))
* export the focused document as a PDF ([1b0dd5f](https://github.com/rcoenen/LiveMark/commit/1b0dd5fa8a81320f115c811ada8cad68cd39da93))
* make packaged builds the default app for Markdown files ([aba58d6](https://github.com/rcoenen/LiveMark/commit/aba58d654df134d376c759de0d5285d3ee9819ba))
* make the path tests pass on Windows ([896d2d2](https://github.com/rcoenen/LiveMark/commit/896d2d299fe5fb3ac9ac99216c611e9f4cbdc251))
* ship one x64 setup and keep the first release off latest ([b6cd049](https://github.com/rcoenen/LiveMark/commit/b6cd04922d923fc2a8514cf5925334c59f777b72))
* ship Windows installers as a regular latest release ([fc2fc68](https://github.com/rcoenen/LiveMark/commit/fc2fc682e8e6be9c9b9b01bc3b83b1daa3cec114))
* show About window on Windows ([70ec115](https://github.com/rcoenen/LiveMark/commit/70ec1159aa7124ed6ec81948bed58d55f2878a43))

## [1.6.3](https://github.com/rcoenen/LiveMark/compare/v1.6.2...v1.6.3) (2026-09-28)


### Bug Fixes

* let the document list be resized ([40ddf14](https://github.com/rcoenen/LiveMark/commit/40ddf14c5b12d5cabdcf07749200317a695929a5))
* name the folded document list and refresh Homebrew before upgrade ([e330564](https://github.com/rcoenen/LiveMark/commit/e33056443b70de0abdf1951acd02cd238c7d9e29))

## [1.6.2](https://github.com/rcoenen/LiveMark/compare/v1.6.1...v1.6.2) (2026-09-28)


### Bug Fixes

* collapse the document rail when the window is narrow ([1ac3bc4](https://github.com/rcoenen/LiveMark/commit/1ac3bc4acfadb487c7770be5895b4dde7177b422))

## [1.6.1](https://github.com/rcoenen/LiveMark/compare/v1.6.0...v1.6.1) (2026-09-27)


### Bug Fixes

* add Copy as Plain Text (⇧⌘C) alongside Markdown copy ([d75e2ca](https://github.com/rcoenen/LiveMark/commit/d75e2cae7d8c19c425d804cfdaea443030db92e2))

## [1.6.0](https://github.com/rcoenen/LiveMark/compare/v1.5.1...v1.6.0) (2026-09-24)


### Features

* restore open documents across restarts ([e7dcd74](https://github.com/rcoenen/LiveMark/commit/e7dcd74e697c5e871911f2bc7f861acb8ec26a98))

## [1.5.1](https://github.com/rcoenen/LiveMark/compare/v1.5.0...v1.5.1) (2026-09-24)


### Bug Fixes

* limit Select All to the document content ([f5c97ec](https://github.com/rcoenen/LiveMark/commit/f5c97ecd41815f30b91dd2df61dbdc4001127bc5))

## [1.5.0](https://github.com/rcoenen/LiveMark/compare/v1.4.3...v1.5.0) (2026-09-23)


### Features

* check for updates and self-update direct installs ([26f4f78](https://github.com/rcoenen/LiveMark/commit/26f4f78e86747af0e91fcc149cdb79303a9fd61e))

## [1.4.3](https://github.com/rcoenen/LiveMark/compare/v1.4.2...v1.4.3) (2026-09-23)


### Bug Fixes

* keep wide tables inside the reading measure ([51dd4be](https://github.com/rcoenen/LiveMark/commit/51dd4bedc69f00407ceb3017cd6b731c985f6726))

## [1.4.2](https://github.com/rcoenen/LiveMark/compare/v1.4.1...v1.4.2) (2026-09-23)


### Bug Fixes

* keep tables and paths intact when copying ([d1cb2fe](https://github.com/rcoenen/LiveMark/commit/d1cb2fed83349309601fa8d0a7c6a45e810b4d5e))

## [1.4.1](https://github.com/rcoenen/LiveMark/compare/v1.4.0...v1.4.1) (2026-09-17)


### Features

* document text zoom, leaner Window menu, Node 24 in CI ([09244a1](https://github.com/rcoenen/LiveMark/commit/09244a1d2481c33910d7b1dae5adb3f8ef75b177))
* documents rail, live-reload feedback, safe rendering and split view ([457d64c](https://github.com/rcoenen/LiveMark/commit/457d64c0f9b5afc556bd15a63b84dfedb5943a40))
* documents rail, live-reload feedback, safe rendering and split view ([2f2fc4e](https://github.com/rcoenen/LiveMark/commit/2f2fc4eeef2781ef3aa705ec0a863fef117e2b10))

## [1.4.0](https://github.com/rcoenen/LiveMark/compare/v1.3.1...v1.4.0) (2026-08-15)


### Features

* replace Electron with a Tauri 2 native macOS runtime
* add secure multi-document file watching, local images, and warm CLI/Finder delivery
* show the package version in a compact application toolbar


### Performance

* remove bundled Chromium, Node.js, Electron, and chokidar runtimes

## [1.3.1](https://github.com/rcoenen/LiveMark/compare/v1.3.0...v1.3.1) (2026-08-15)


### Bug Fixes

* ad-hoc sign macOS releases ([d8e9120](https://github.com/rcoenen/LiveMark/commit/d8e91202184d55f40ed1964e58b5f7947393b298))
