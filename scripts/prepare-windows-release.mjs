import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const versioned = `LiveMark_${version}_x64-setup.exe`;
const source = join('src-tauri', 'target', 'release', 'bundle', 'nsis', versioned);

if (!existsSync(source)) {
  console.error(`missing ${source}`);
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
const destination = join('dist', versioned);
copyFileSync(source, destination);

const signed = spawnSync('npx', ['tauri', 'signer', 'sign', destination], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (signed.status !== 0) {
  process.exit(signed.status ?? 1);
}

const signature = readFileSync(`${destination}.sig`, 'utf8').trim();
const platform = {
  signature,
  url: `https://github.com/rcoenen/LiveMark/releases/download/v${version}/${versioned}`,
};
writeFileSync(join('dist', 'windows-platform.json'), `${JSON.stringify(platform, null, 2)}\n`);
console.log(`Signed ${destination}`);
