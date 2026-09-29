#!/bin/sh
# Publishes mac.json and windows.json on the download-badges branch.
# The README shields read those files. The branch stays off main so daily
# count updates do not appear in the project history.

set -eu

if [ -z "${GH_TOKEN:-}" ]; then
  echo "error: GH_TOKEN is required" >&2
  exit 1
fi

repository="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
badges="$(mktemp -d "${TMPDIR:-/tmp}/livemark-badges.XXXXXX")"
work="$(mktemp -d "${TMPDIR:-/tmp}/livemark-badge-repo.XXXXXX")"

node scripts/download-counts.mjs --out "$badges"

git clone --depth 1 "https://x-access-token:${GH_TOKEN}@github.com/${repository}.git" "$work"
git -C "$work" config user.name "github-actions[bot]"
git -C "$work" config user.email "41898282+github-actions[bot]@users.noreply.github.com"

if git -C "$work" ls-remote --exit-code --heads origin download-badges >/dev/null 2>&1; then
  git -C "$work" fetch --depth 1 origin download-badges
  git -C "$work" checkout download-badges
else
  git -C "$work" checkout --orphan download-badges
  git -C "$work" rm -rf --cached . >/dev/null 2>&1 || true
fi

find "$work" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp "$badges/mac.json" "$badges/windows.json" "$work/"
git -C "$work" add -A
if git -C "$work" diff --cached --quiet; then
  echo "Download badges unchanged"
  exit 0
fi

git -C "$work" commit -m "chore: update download badges"
git -C "$work" push origin download-badges
