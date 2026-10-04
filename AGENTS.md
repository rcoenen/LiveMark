<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Hard Rules

## Version bumps

Never cut a release that bumps the version by more than a patch (+0.0.1) without the user's expressed permission.

In this repo release-please derives the bump from conventional commit prefixes, so in practice:

- `fix:` / `chore:` / `docs:` / `refactor:` / `perf:` commits are fine — they produce patch (or no) bumps.
- `feat:` commits produce a **minor** bump, and `feat!:` / `BREAKING CHANGE` produce a **major** bump. Do not push these, and do not merge a release PR containing them, until the user has explicitly approved that minor/major bump.
- When a feature is ready but unapproved for a minor bump, hold the commit locally or on a branch and ask first.

## Lockstep versioning

macOS and Windows always ship the same version number, from the same `package.json`. There is no per-platform version number. Any change bumps everyone together — a Windows-only fix still bumps the Mac build and vice versa. Do not ship `1.6.4` for Mac and a different number for Windows.

## Release tags

The published download tags put the platform after that shared version. The suffix is uppercase, with a hyphen, and there is no `v` prefix:

- `x.x.x-MAC` — Mac only. Example: `1.6.4-MAC`. This release holds the DMG, the Mac updater archive, and `install.sh`.
- `x.x.x-WIN` — Windows only. Example: `1.6.4-WIN`. This release holds both installers, x64 and ARM.

Do not publish one combined download tag such as `v1.6.4`, and do not invent a second version such as `1.6.4-windows.1`. release-please may still create the git tag `v1.6.4` so it knows which version it already shipped. That git tag is not a download release. `latest.json` is attached to both download tags, and each file URL inside it uses the tag for its own platform.

## Commit scopes for platform

Mark which platform(s) a change touches using the conventional-commit scope, so it shows up in the changelog:

- `fix:` / `feat:` with no scope — applies generally (both platforms).
- `fix(macos):` / `feat(macos):` — macOS only.
- `fix(windows):` / `feat(windows):` — Windows only.

The scope does not change the bump; release-please renders it inline (e.g. `* **windows:** show About window on Windows`).
