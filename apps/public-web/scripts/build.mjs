import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '../..');
const distRoot = resolve(repoRoot, 'dist');

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
await cp(resolve(appRoot, 'src/index.html'), resolve(distRoot, 'index.html'));
await cp(resolve(appRoot, 'src/app.js'), resolve(distRoot, 'app.js'));
await cp(resolve(appRoot, 'src/mock-api.js'), resolve(distRoot, 'mock-api.js'));
await cp(resolve(appRoot, 'src/styles.css'), resolve(distRoot, 'styles.css'));
await cp(resolve(appRoot, 'public'), distRoot, { recursive: true });
await mkdir(resolve(distRoot, '.openai'), { recursive: true });
await cp(resolve(repoRoot, '.openai/hosting.json'), resolve(distRoot, '.openai/hosting.json'));

console.log(`Built @keyforta/public-web to ${distRoot}`);
