import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['src/index.html', 'src/main.jsx', 'src/portal-app.jsx', 'src/styles.css', 'vite.config.js']) await access(join(root, file));
const source = await readFile(join(root, 'src/portal-app.jsx'), 'utf8');
if (!source.includes('FluentProvider')) throw new Error('React Fluent UI entry point is missing.');
for (const role of ['tenant', 'landlord', 'manager', 'operator']) {
	if (!source.includes(`${role}: {`)) throw new Error(`Portal workspace role is missing: ${role}`);
}
if (!source.includes('new URLSearchParams(window.location.search)')) throw new Error('Public-to-portal role handoff is missing.');
console.log('portal-web check passed: React login gate and protected shell are present.');
