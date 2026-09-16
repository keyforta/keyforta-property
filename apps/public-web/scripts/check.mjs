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

function assertHeroTypewriterInsets(styles) {
  assert.match(
    styles,
    /@media \(max-width: 1100px\) \{(?:(?!@media)[\s\S])*?\.page > \.hero > \.hero-media \{[^}]*padding:\s*0 30px 30px;/,
    'The tablet hero typewriter must have equal left, right, and bottom insets.'
  );
  assert.match(
    styles,
    /@media \(max-width: 600px\) \{(?:(?!@media)[\s\S])*?\.page > \.hero > \.hero-media \{[^}]*padding:\s*0 16px 16px;/,
    'The phone hero typewriter must have equal left, right, and bottom insets.'
  );
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
const marketingStyles = await readFile(resolve(appRoot, 'src/views/MarketingPages.styles.css'), 'utf8');
assertHeroTypewriterInsets(marketingStyles);
assert.throws(
  () => assertFeaturedIntroWrappable(`${styles}\n${featuredIntroSelector} { white-space: nowrap; }`),
  /must remain wrappable/,
  'A later featured-intro override must not evade the wrapping regression.'
);
const layout = await readFile(resolve(appRoot, 'src/components/Layout.jsx'), 'utf8');
const app = await readFile(resolve(appRoot, 'src/App.jsx'), 'utf8');
assert.doesNotMatch(
  layout,
  /<source[^>]+keyforta-symbol\.png/,
  'The phone header must keep using the primary PNG logo.'
);
assert.match(
  layout,
  /<DrawerHeaderTitle[\s\S]*?<img[\s\S]*?className=\{styles\.drawerLogo\}[\s\S]*?src="keyforta-logo-primary\.png"[\s\S]*?<\/DrawerHeaderTitle>/,
  'The mobile drawer must use the primary PNG logo.'
);
assert.match(
  layout,
  /language:\s*\{[\s\S]*?width:\s*"52px"[\s\S]*?minWidth:\s*"52px"[\s\S]*?minHeight:\s*"44px"/,
  'The language control must remain compact while preserving its touch target.'
);
assert.match(
  layout,
  /aria-label=\{t\("common\.switch_language"\)\}[\s\S]*?lang === "en" \? "🇫🇷" : "🇺🇸"/,
  'The language control must show the flag for the target language.'
);
assert.match(
  layout,
  /requestAccess:\s*\{[\s\S]*?minHeight:\s*"44px"[\s\S]*?paddingRight:\s*"12px"[\s\S]*?paddingLeft:\s*"12px"/,
  'The request-access control must remain compact while preserving its touch target.'
);
assert.match(
  layout,
  /export function BackToTop\(\)[\s\S]*?window\.scrollY > 400[\s\S]*?prefers-reduced-motion[\s\S]*?window\.scrollTo\(\{ top: 0/,
  'Back to top must appear after scrolling and respect reduced-motion preferences.'
);
assert.match(app, /<BackToTop \/>/, 'Back to top must be mounted across public routes.');
const propertyPages = await readFile(resolve(appRoot, 'src/views/PropertyPages.jsx'), 'utf8');
const propertyStyles = await readFile(resolve(appRoot, 'src/views/PropertyPages.styles.css'), 'utf8');
assert.doesNotMatch(
  propertyPages,
  /Filter20Regular|styles\.action|property_pages\.apply_filters/,
  'Property filters apply immediately and must not render a redundant submit action.'
);
assert.match(
  propertyPages,
  /<Tooltip[\s\S]*?content=\{t\("property_pages\.reset"\)\}[\s\S]*?<Button[\s\S]*?aria-label=\{t\("property_pages\.reset"\)\}[\s\S]*?icon=\{<ArrowReset20Regular \/>\}[\s\S]*?\/>/,
  'Reset must remain an accessible icon-only command with a tooltip.'
);
assert.match(
  propertyStyles,
  /\.property-discovery-head h1\s*\{[^}]*max-width:\s*none;[^}]*white-space:\s*nowrap;/,
  'The property discovery title must remain on one line where space permits.'
);
assert.match(
  propertyStyles,
  /@media \(max-width: 900px\)[\s\S]*?\.property-discovery-head h1\s*\{[^}]*white-space:\s*normal;/,
  'The property discovery title must wrap safely on small screens.'
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
