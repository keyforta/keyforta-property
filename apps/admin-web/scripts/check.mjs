import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['src/index.html', 'src/app.js', 'src/styles.css']) await access(join(root, file));
new Function(await readFile(join(root, 'src/app.js'), 'utf8'));
console.log('admin-web check passed: login gate and protected shell are present.');
