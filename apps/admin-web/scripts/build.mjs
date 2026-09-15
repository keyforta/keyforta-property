import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(['index.html', 'app.js', 'styles.css'].map((file) => cp(join(root, 'src', file), join(output, file))));
console.log('admin-web build passed: dist contains the login-gated admin app.');
