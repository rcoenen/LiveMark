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

macOS and Windows always ship the same version, from the same `package.json`. There is no per-platform version. Any change bumps everyone together — a Windows-only fix still bumps the Mac build and vice versa. Do not introduce platform-specific version numbers.

## Commit scopes for platform

Mark which platform(s) a change touches using the conventional-commit scope, so it shows up in the changelog:

- `fix:` / `feat:` with no scope — applies generally (both platforms).
- `fix(macos):` / `feat(macos):` — macOS only.
- `fix(windows):` / `feat(windows):` — Windows only.

The scope does not change the bump; release-please renders it inline (e.g. `* **windows:** show About window on Windows`).
