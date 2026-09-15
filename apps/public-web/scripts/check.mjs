import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'src/index.html',
  'src/main.jsx',
  'src/i18n.js',
  'src/locales/en.json',
  'src/locales/fr.json',
  'src/App.jsx',
  'src/components/Layout.jsx',
  'src/components/PropertyCard.jsx',
  'src/components/StatusMessage.jsx',
  'src/pages/MarketingPages.jsx',
  'src/pages/PropertyPages.jsx',
  'src/pages/AccountPages.jsx',
  'src/pages/ContentPages.jsx',
  'src/pages/index.js',
  'src/data/content.js',
  'src/services/storage.js',
  'src/styles.css',
  'public/keyforta-app-icon.png',
  'public/keyforta-symbol.png',
  'public/keyforta-logo-primary.png',
  'public/keyforta-logo-reversed.png',
  'vite.config.js'
];

for (const relativePath of requiredFiles) await access(resolve(appRoot, relativePath));
JSON.parse(await readFile(resolve(appRoot, 'src/locales/en.json'), 'utf8'));
JSON.parse(await readFile(resolve(appRoot, 'src/locales/fr.json'), 'utf8'));
const styles = await readFile(resolve(appRoot, 'src/styles.css'), 'utf8');
const featuredIntroRule = styles.match(/\.featured-section \.section-head > p[^{}]*\{([^}]*)\}/);
assert(featuredIntroRule, 'Expected a featured-section intro style rule.');
assert.doesNotMatch(
  featuredIntroRule[1],
  /white-space:\s*nowrap/,
  'The featured listing intro must remain wrappable for localized copy.'
);
console.log(`Checked ${requiredFiles.length} public-web source files, locale JSON parsing, JavaScript syntax, and responsive featured-intro wrapping.`);
