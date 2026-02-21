import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = resolve(__dirname, '..');
const repoRoot = resolve(appRoot, '..', '..');
const publicDir = resolve(appRoot, 'public');

const copyTasks = [
  [resolve(repoRoot, 'assets'), resolve(publicDir, 'assets')],
  [resolve(repoRoot, 'styles.css'), resolve(publicDir, 'styles.css')],
  [resolve(repoRoot, 'app.js'), resolve(publicDir, 'app.js')],
  [resolve(repoRoot, 'admin.js'), resolve(publicDir, 'admin.js')],
  [resolve(repoRoot, 'admin.css'), resolve(publicDir, 'admin.css')],
  [resolve(repoRoot, 'projects.json'), resolve(publicDir, 'projects.json')]
];

await mkdir(publicDir, { recursive: true });

for (const [src, dest] of copyTasks) {
  await cp(src, dest, { recursive: true, force: true });
}
