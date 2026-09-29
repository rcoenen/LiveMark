import { readFileSync, writeFileSync } from 'node:fs';

const [macPath, windowsPath, outputPath] = process.argv.slice(2);
if (!macPath || !windowsPath || !outputPath) {
  console.error('usage: node scripts/merge-latest.mjs <mac latest.json> <windows-platform.json> <output>');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(macPath, 'utf8'));
const windows = JSON.parse(readFileSync(windowsPath, 'utf8'));
manifest.platforms['windows-x86_64'] = windows;
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
