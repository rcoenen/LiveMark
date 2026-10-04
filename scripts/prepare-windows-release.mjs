import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const arch = process.argv[2] ?? 'x64';
if (arch !== 'x64' && arch !== 'arm64') {
  console.error('usage: node scripts/prepare-windows-release.mjs [x64|arm64]');
  process.exit(1);
}

const platformKey = arch === 'arm64' ? 'windows-aarch64' : 'windows-x86_64';
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const tauriName = `LiveMark_${version}_${arch}-setup.exe`;
const source = join(
  'src-tauri',
  'target',
  ...(arch === 'arm64' ? ['aarch64-pc-windows-msvc', 'release'] : ['release']),
  'bundle',
  'nsis',
  tauriName,
);
const versioned = `LiveMark-${version}-win-${arch}-setup.exe`;
const alias = `LiveMark-win-${arch}-setup.exe`;

if (!existsSync(source)) {
  console.error(`missing ${source}`);
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
const destination = join('dist', versioned);
copyFileSync(source, destination);
copyFileSync(destination, join('dist', alias));

const signed = spawnSync('npx', ['tauri', 'signer', 'sign', destination], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (signed.status !== 0) {
  process.exit(signed.status ?? 1);
}

const signature = readFileSync(`${destination}.sig`, 'utf8').trim();
const platform = {
  [platformKey]: {
    signature,
    url: `https://github.com/rcoenen/LiveMark/releases/download/${version}-WIN/${versioned}`,
  },
};
writeFileSync(join('dist', `windows-${arch}-platform.json`), `${JSON.stringify(platform, null, 2)}\n`);
console.log(`Signed ${destination}`);
