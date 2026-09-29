import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node scripts/merge-latest.mjs <mac latest.json> <output> <windows-platform.json...>');
  process.exit(1);
}

const [macPath, outputPath, ...windowsPaths] = args;

const manifest = JSON.parse(readFileSync(macPath, 'utf8'));
for (const windowsPath of windowsPaths) {
  Object.assign(manifest.platforms, JSON.parse(readFileSync(windowsPath, 'utf8')));
}
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
