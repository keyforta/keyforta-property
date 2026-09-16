import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const featuredIntroSelector = '.featured-section .section-head > p';

function assertFeaturedIntroWrappable(styles) {
  const featuredIntroRules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors
      .split(',')
      .some((selector) => selector.trim() === featuredIntroSelector));
  assert(featuredIntroRules.length > 0, 'Expected a featured-section intro style rule.');
  for (const [, , declarations] of featuredIntroRules) {
    assert.doesNotMatch(
      declarations,
      /white-space:\s*nowrap/,
      'The featured listing intro must remain wrappable for localized copy.'
    );
  }
}

const requiredFiles = [
  'app/layout.jsx',
  'app/client-shell.jsx',
  'app/[[...path]]/page.jsx',
  'src/main.jsx',
  'src/i18n.js',
  'src/locales/en.json',
  'src/locales/fr.json',
  'src/App.jsx',
  'src/components/Layout.jsx',
  'src/components/PropertyCard.jsx',
  'src/components/StatusMessage.jsx',
  'src/views/MarketingPages.jsx',
  'src/views/PropertyPages.jsx',
  'src/views/AccountPages.jsx',
  'src/views/ContentPages.jsx',
  'src/views/index.js',
  'src/data/content.js',
  'src/services/storage.js',
  'src/styles.css',
  'public/keyforta-app-icon.png',
  'public/keyforta-symbol.png',
  'public/keyforta-logo-primary.png',
  'public/keyforta-logo-reversed.png',
  'next.config.mjs'
];

for (const relativePath of requiredFiles) await access(resolve(appRoot, relativePath));
JSON.parse(await readFile(resolve(appRoot, 'src/locales/en.json'), 'utf8'));
JSON.parse(await readFile(resolve(appRoot, 'src/locales/fr.json'), 'utf8'));
const styles = await readFile(resolve(appRoot, 'src/styles.css'), 'utf8');
assertFeaturedIntroWrappable(styles);
assert.throws(
  () => assertFeaturedIntroWrappable(`${styles}\n${featuredIntroSelector} { white-space: nowrap; }`),
  /must remain wrappable/,
  'A later featured-intro override must not evade the wrapping regression.'
);
console.log(`Checked ${requiredFiles.length} public-web files, locale JSON parsing, and responsive featured-intro wrapping.`);
