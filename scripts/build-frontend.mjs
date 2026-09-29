import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = join(root, 'dist', 'frontend');

rmSync(frontend, { recursive: true, force: true });
mkdirSync(join(frontend, 'renderer'), { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npx', ['tsc', '--noEmit']);
run('npx', [
  'esbuild',
  'src/renderer/renderer.ts',
  '--bundle',
  '--outfile=dist/frontend/renderer/renderer.js',
  '--platform=browser',
  '--target=safari13.1',
]);
copyFileSync(join(root, 'src', 'renderer', 'styles.css'), join(frontend, 'renderer', 'styles.css'));
copyFileSync(join(root, 'index.html'), join(frontend, 'index.html'));
