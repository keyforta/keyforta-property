import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['src/index.html', 'src/main.jsx', 'src/OnboardingAdmin.jsx', 'src/onboarding-api.js', 'src/styles.css', 'vite.config.js']) await access(join(root, file));
const entrySource = await readFile(join(root, 'src/main.jsx'), 'utf8');
const source = await readFile(join(root, 'src/OnboardingAdmin.jsx'), 'utf8');
if (!entrySource.includes('FluentProvider') || !entrySource.includes('createRoot')) throw new Error('React Fluent UI entry point is missing.');
if (!source.includes('createBrowserEntraAuth') || !source.includes("status === 'signed-in'")) throw new Error('Verified Entra login gate is missing.');
if (!/redirectUri: ['"]\/auth\/callback['"]/.test(source) || !/completeBrowserEntraRedirect\(\)/.test(entrySource)) throw new Error('Admin authentication must use the MSAL redirect bridge callback.');
if (!source.includes("queue.status === 'empty'") || !source.includes("queue.status === 'denied'") || !source.includes("status: 'error'")) throw new Error('Explicit onboarding queue states are missing.');
if (!source.includes('Decision reason') || !source.includes("'approved'") || !source.includes("'rejected'")) throw new Error('Onboarding decision controls are missing.');
if (/localStorage|admin@test|sample|metrics|Recent platform activity|Bandalungwa|operator@example/.test(`${entrySource}\n${source}`)) throw new Error('Demo admin identity or customer data must not be present.');
const apiSource = await readFile(join(root, 'src/onboarding-api.js'), 'utf8');
if (!/getAccessToken\(\)[\s\S]*authorization: `Bearer \$\{accessToken\}`/.test(apiSource)) throw new Error('Admin API calls must acquire an Entra bearer token.');
if (/localStorage|sessionStorage/.test(apiSource)) throw new Error('Admin tokens must not use browser storage.');
console.log('admin-web check passed: Entra gate, authenticated review queue, explicit states, and decision controls are present.');
