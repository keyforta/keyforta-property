import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['src/index.html', 'src/main.jsx', 'src/PropertySetup.jsx', 'src/styles.css', 'vite.config.js']) await access(join(root, file));
const source = await readFile(join(root, 'src/main.jsx'), 'utf8');
const propertySetup = await readFile(join(root, 'src/PropertySetup.jsx'), 'utf8');
if (!source.includes('FluentProvider') || !source.includes('createRoot')) throw new Error('React Fluent UI entry point is missing.');
for (const role of ['tenant', 'landlord', 'manager', 'operator']) {
	if (!source.includes(`${role}: {`)) throw new Error(`Portal workspace role is missing: ${role}`);
}
if (!source.includes('new URLSearchParams(window.location.search)')) throw new Error('Public-to-portal role handoff is missing.');
if (!source.includes('<PropertySetup />')) throw new Error('Landlord property setup route is missing.');
if (!propertySetup.includes('createRentalPropertyInputSchema.safeParse')) throw new Error('Property setup must validate through the shared contract.');
if (!propertySetup.includes('keyforta.portal.property-drafts')) throw new Error('Property setup local draft persistence is missing.');
if (!propertySetup.includes('Property details') || !propertySetup.includes('Address & location') || !propertySetup.includes('First unit')) {
	throw new Error('Property setup is missing a required section.');
}
console.log('portal-web check passed: React shell and contract-validated property setup are present.');
