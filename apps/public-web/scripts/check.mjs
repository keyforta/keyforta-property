import assert from 'node:assert/strict';
import { access, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPortalUrl, resolvePortalWebUrl } from '../src/portal-url.js';
import { getLegacyRouteUrl } from '../src/route-normalization.js';
import nextConfig from '../next.config.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const featuredIntroSelector = '.featured-section .section-head > p';

async function assertSingleKeyborgRuntime() {
  const appRequire = createRequire(resolve(appRoot, 'package.json'));
  const reactComponentsPackage = appRequire.resolve('@fluentui/react-components/package.json');
  const reactComponentsRequire = createRequire(reactComponentsPackage);
  const fluentTabsterPackage = reactComponentsRequire.resolve('@fluentui/react-tabster/package.json');
  const fluentTabsterRequire = createRequire(fluentTabsterPackage);
  const tabsterPackage = fluentTabsterRequire.resolve('tabster/package.json');
  const tabsterRequire = createRequire(tabsterPackage);
  const fluentKeyborg = await realpath(fluentTabsterRequire.resolve('keyborg/package.json'));
  const tabsterKeyborg = await realpath(tabsterRequire.resolve('keyborg/package.json'));
  assert.equal(
    fluentKeyborg,
    tabsterKeyborg,
    'Fluent UI and Tabster must share one Keyborg runtime to avoid browser-global instance collisions.'
  );
}

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
await assertSingleKeyborgRuntime();
JSON.parse(await readFile(resolve(appRoot, 'src/locales/en.json'), 'utf8'));
JSON.parse(await readFile(resolve(appRoot, 'src/locales/fr.json'), 'utf8'));
const styles = await readFile(resolve(appRoot, 'src/styles.css'), 'utf8');
assertFeaturedIntroWrappable(styles);
assert.throws(
  () => assertFeaturedIntroWrappable(`${styles}\n${featuredIntroSelector} { white-space: nowrap; }`),
  /must remain wrappable/,
  'A later featured-intro override must not evade the wrapping regression.'
);
assert.equal(getLegacyRouteUrl({ hash: '', search: '' }), null);
assert.equal(getLegacyRouteUrl({ hash: '#/properties', search: '?city=Kinshasa' }), '/properties?city=Kinshasa');
assert.equal(getLegacyRouteUrl({ hash: '#property/unit-1', search: '' }), '/property/unit-1');
assert.equal(getLegacyRouteUrl({ hash: '#status', search: '' }), '/home#status');
assert.equal(getLegacyRouteUrl({ hash: '#section', search: '' }), null);
assert.equal(resolvePortalWebUrl(undefined, 'production'), null);
assert.equal(resolvePortalWebUrl(undefined, 'development'), 'http://127.0.0.1:3001/');
assert.equal(
  buildPortalUrl('https://portal.example/', 'tenant', 'tenant@example.test'),
  'https://portal.example/?role=tenant&email=tenant%40example.test',
);
assert.deepEqual(await nextConfig.redirects(), [
  {
    destination: 'https://keyforta.com/:path*',
    has: [{ type: 'host', value: 'www.keyforta.com' }],
    permanent: true,
    source: '/:path*',
  },
]);
console.log(`Checked ${requiredFiles.length} public-web files, canonical redirect, route normalization, locale JSON parsing, and responsive featured-intro wrapping.`);
