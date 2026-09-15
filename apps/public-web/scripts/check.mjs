import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'src/index.html',
  'src/app.js',
  'src/mock-api.js',
  'src/styles.css',
  'public/keyforta-app-icon.png',
  'public/keyforta-hero.png',
  'public/keyforta-logo-primary.svg',
  'public/keyforta-logo-reversed.svg'
];

for (const relativePath of requiredFiles) await access(resolve(appRoot, relativePath));
new Function(await readFile(resolve(appRoot, 'src/app.js'), 'utf8'));
console.log(`Checked ${requiredFiles.length} public-web source files and JavaScript syntax.`);
