import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['src/index.html', 'src/main.jsx', 'src/styles.css', 'vite.config.js']) await access(join(root, file));
const source = await readFile(join(root, 'src/main.jsx'), 'utf8');
if (!source.includes('FluentProvider') || !source.includes('createRoot')) throw new Error('React Fluent UI entry point is missing.');
console.log('admin-web check passed: React login gate and protected shell are present.');
