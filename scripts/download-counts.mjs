import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repository = process.env.GITHUB_REPOSITORY || 'rcoenen/LiveMark';
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const outFlag = process.argv.indexOf('--out');
const outDir = outFlag === -1 ? '' : process.argv[outFlag + 1];

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'livemark-download-counts',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (token) headers.Authorization = `Bearer ${token}`;

let page = 1;
let mac = 0;
let windows = 0;

while (page < 20) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
    { headers },
  );
  if (!response.ok) {
    const body = await response.text();
    console.error(`GitHub releases request failed (${response.status}): ${body}`);
    process.exit(1);
  }
  const releases = await response.json();
  if (!Array.isArray(releases) || releases.length === 0) break;
  for (const release of releases) {
    for (const asset of release.assets ?? []) {
      const name = String(asset.name).toLowerCase();
      const count = Number(asset.download_count) || 0;
      if (name.endsWith('.dmg')) mac += count;
      else if (name.endsWith('-setup.exe')) windows += count;
    }
  }
  if (releases.length < 100) break;
  page += 1;
}

function badge(label, message) {
  return {
    schemaVersion: 1,
    label,
    message: String(message),
    color: '2C7BE5',
  };
}

const macBadge = badge('mac', mac);
const windowsBadge = badge('windows', windows);

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'mac.json'), `${JSON.stringify(macBadge)}\n`);
  writeFileSync(join(outDir, 'windows.json'), `${JSON.stringify(windowsBadge)}\n`);
}

console.log(`mac ${mac}`);
console.log(`windows ${windows}`);
