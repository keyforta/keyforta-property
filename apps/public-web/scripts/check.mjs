import assert from 'node:assert/strict';
import { access, readFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPortalUrl, resolvePortalWebUrl } from '../src/portal-url.js';
import { getLegacyRouteUrl } from '../src/route-normalization.js';
import { formatMinorMoney, resolveApiBaseUrl } from '../src/services/public-properties.js';
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
  'src/components/AccessDialog.jsx',
  'src/components/BackToTop.jsx',
  'src/components/Footer.jsx',
  'src/components/Header.jsx',
  'src/components/Layout.jsx',
  'src/components/PropertyCard.jsx',
  'src/components/ListingRequestState.jsx',
  'src/components/ListingRequestState.styles.css',
  'src/components/StatusMessage.jsx',
  'src/views/MarketingPages.jsx',
  'src/views/PropertyPages.jsx',
  'src/views/AccountPages.jsx',
  'src/views/ContentPages.jsx',
  'src/views/index.js',
  'src/data/content.js',
  'src/services/storage.js',
  'src/services/public-properties.js',
  'src/services/landlord-onboarding.js',
  'src/services/viewing-requests.js',
  'src/hooks/use-public-properties.js',
  'src/styles.css',
  'public/assets/brand/keyforta-app-icon.png',
  'public/assets/brand/keyforta-symbol.png',
  'public/assets/brand/keyforta-logo-primary.png',
  'public/assets/brand/keyforta-logo-reversed.png',
  'public/assets/brand/logo-assets.json',
  'public/assets/marketing/keyforta-marketing-video.mp4',
  'public/assets/properties/ngaliema-river.jpg',
  'next.config.mjs'
];

for (const relativePath of requiredFiles) await access(resolve(appRoot, relativePath));
const publicRootEntries = await readdir(resolve(appRoot, 'public'));
assert.deepEqual(
  publicRootEntries.filter((name) => /\.(?:avif|jpe?g|png|svg|webp|mp4)$/i.test(name)),
  [],
  'Images and marketing media must live in a categorized public/assets folder.'
);
await assertSingleKeyborgRuntime();
JSON.parse(await readFile(resolve(appRoot, 'public/assets/brand/logo-assets.json'), 'utf8'));
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
const accessDialog = await readFile(resolve(appRoot, 'src/components/AccessDialog.jsx'), 'utf8');
const backToTop = await readFile(resolve(appRoot, 'src/components/BackToTop.jsx'), 'utf8');
const header = await readFile(resolve(appRoot, 'src/components/Header.jsx'), 'utf8');
const app = await readFile(resolve(appRoot, 'src/App.jsx'), 'utf8');
const marketingPages = await readFile(resolve(appRoot, 'src/views/MarketingPages.jsx'), 'utf8');
const accountPages = await readFile(resolve(appRoot, 'src/views/AccountPages.jsx'), 'utf8');
const onboardingService = await readFile(resolve(appRoot, 'src/services/landlord-onboarding.js'), 'utf8');
const authCallback = await readFile(resolve(appRoot, 'app/auth/callback/page.jsx'), 'utf8');
const onboardingProxy = await readFile(resolve(appRoot, 'app/api/v1/landlord-onboarding-applications/route.js'), 'utf8');
const content = await readFile(resolve(appRoot, 'src/data/content.js'), 'utf8');
assert.match(app, /function openAccess\(interestValue\) \{[\s\S]*?interestValue === ['"]landlord['"][\s\S]*?navigate\(['"]\/signup\/landlord['"]\)/, 'Known landlord access intent must open authenticated onboarding directly.');
assert.match(app, /function handleAccessSubmit\(values\) \{[\s\S]*?values\.role === ['"]landlord['"][\s\S]*?navigate\(['"]\/signup\/landlord['"]\)[\s\S]*?return ['"]/,
  'A landlord selected in the access dialog must bypass the local-only request store.');
const listingSources = await Promise.all([
  'src/App.jsx',
  'src/components/PropertyCard.jsx',
  'src/views/MarketingPages.jsx',
  'src/views/PropertyPages.jsx',
].map((relativePath) => readFile(resolve(appRoot, relativePath), 'utf8')));
assert.doesNotMatch(content, /export const properties|frPropertyCopy|localizeProperty/, 'Marketing content must not export public listing fixtures.');
for (const source of listingSources) {
  assert.doesNotMatch(source, /from ['"]\.\.?(?:\/\.\.)?\/data\/content\.js['"][\s\S]*\bproperties\b/, 'Public listing paths must not import fixture properties.');
  assert.doesNotMatch(source, /\.find\([^;]+\)\s*\|\|\s*properties\[0\]/, 'Unknown property IDs must not fall back to the first listing.');
}
assert.doesNotMatch(
  header,
  /<source[^>]+keyforta-symbol\.png/,
  'The phone header must keep using the primary PNG logo.'
);
assert.match(
  header,
  /<DrawerHeaderTitle[\s\S]*?<img[\s\S]*?className=\{styles\.drawerLogo\}[\s\S]*?src="\/assets\/brand\/keyforta-logo-primary\.png"[\s\S]*?<\/DrawerHeaderTitle>/,
  'The mobile drawer must use the primary PNG logo.'
);
assert.doesNotMatch(
  header,
  /src="keyforta-(?:logo|wordmark|symbol)/,
  'Brand asset URLs must be root-relative so they render on nested routes.'
);
assert.match(header, /const requestAccess = \(\) => \{\s*onCloseMenu\(\);\s*onOpenAccess\(accessRole\);\s*\}/, 'Request access must close mobile navigation before routing.');
assert.match(
  marketingPages,
  /const marketingHeroImageUrl = '\/assets\/properties\/ngaliema-river\.jpg';/,
  'The marketing hero must render independently of public listing data.'
);
assert.match(
  header,
  /language:\s*\{[\s\S]*?width:\s*"52px"[\s\S]*?minWidth:\s*"52px"[\s\S]*?minHeight:\s*"44px"/,
  'The language control must remain compact while preserving its touch target.'
);
assert.match(
  header,
  /aria-label=\{t\("common\.switch_language"\)\}[\s\S]*?lang === "en" \? "🇫🇷" : "🇺🇸"/,
  'The language control must show the flag for the target language.'
);
assert.match(
  header,
  /requestAccess:\s*\{[\s\S]*?minHeight:\s*"44px"[\s\S]*?paddingRight:\s*"12px"[\s\S]*?paddingLeft:\s*"12px"/,
  'The request-access control must remain compact while preserving its touch target.'
);
assert.match(
  backToTop,
  /export function BackToTop\(\)[\s\S]*?window\.scrollY > 400[\s\S]*?prefers-reduced-motion[\s\S]*?window\.scrollTo\(\{ top: 0/,
  'Back to top must appear after scrolling and respect reduced-motion preferences.'
);
assert.doesNotMatch(
  accessDialog,
  /\b(?:borderStyle|borderColor)\s*:/,
  'Access dialog styles must not use Griffel-unsupported border shorthands.'
);
assert.match(app, /<BackToTop \/>/, 'Back to top must be mounted across public routes.');
assert.match(accountPages, /name="applicantName"[\s\S]*name="proposedOrganizationName"/, 'Landlord onboarding must submit only the approved applicant fields.');
assert.match(accountPages, /const form = event\.currentTarget;[\s\S]*new FormData\(form\)[\s\S]*await submitLandlordOnboardingApplication[\s\S]*form\.reset\(\)/, 'Landlord onboarding must retain the form before awaiting the API response.');
assert.doesNotMatch(accountPages.match(/function LandlordSignupPage\([\s\S]*?\n\}/)?.[0] || '', /name="email"|name="phone"|localStorage/, 'Landlord onboarding must not collect unsupported contact fields or persist locally.');
assert.match(onboardingService, /getAccessToken\(\)[\s\S]*authorization: `Bearer \$\{accessToken\}`/, 'Landlord onboarding must acquire and forward an Entra API token.');
assert.match(onboardingService, /redirectUri: ['"]\/auth\/callback['"]/, 'Landlord onboarding must use the dedicated MSAL callback route.');
assert.match(authCallback, /completeBrowserEntraRedirect\(\)/, 'The MSAL callback route must broadcast the response to its parent window.');
assert.match(onboardingProxy, /landlordOnboardingApplicationInputSchema[\s\S]*authorization,[\s\S]*'content-type'/, 'The onboarding proxy must validate the body and forward only bounded API headers.');
const propertyPages = await readFile(resolve(appRoot, 'src/views/PropertyPages.jsx'), 'utf8');
const publicPropertiesService = await readFile(resolve(appRoot, 'src/services/public-properties.js'), 'utf8');
const propertyStyles = await readFile(resolve(appRoot, 'src/views/PropertyPages.styles.css'), 'utf8');
const viewingRequestsService = await readFile(resolve(appRoot, 'src/services/viewing-requests.js'), 'utf8');
const viewsIndex = await readFile(resolve(appRoot, 'src/views/index.js'), 'utf8');
assert.doesNotMatch(propertyPages, /RentalApplicationPage|apply_unit|\/apply\//, 'The excluded public rental-application prototype must not remain in the public property views.');
assert.doesNotMatch(viewsIndex, /RentalApplicationPage/, 'The excluded rental-application prototype must not be exported.');
assert.doesNotMatch(app, /RentalApplicationPage|handleRentalApplication|kf-rental-applications|path="\/apply/, 'The public app must not route to or persist the excluded rental-application prototype.');
assert.match(viewingRequestsService, /publicViewingRequestInputSchema[\s\S]*fetch\(['"]\/api\/v1\/viewing-requests['"]/, 'The viewing-request service must validate input and call the real API.');
assert.match(propertyPages, /await submitViewingRequest\(\{[\s\S]*?propertyId: property\.id/, 'The viewing form must submit through the real API instead of local storage.');
assert.doesNotMatch(propertyPages, /appendRow\(['"]kf-viewing-requests['"]/, 'Viewing inquiries must not be stored indefinitely in the browser.');
assert.match(propertyPages, /submitError\?\.code === ['"]RATE_LIMITED['"][\s\S]*?status\.viewing_rate_limited/, 'A rate-limited viewing submission must show a truthful, distinct status.');
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
assert.equal(resolveApiBaseUrl(undefined), '/api/v1');
assert.equal(resolveApiBaseUrl(' /custom/api/ '), '/custom/api');
assert.equal(resolveApiBaseUrl('//attacker.example/api'), '/api/v1');
assert.equal(resolveApiBaseUrl('javascript:alert(1)'), '/api/v1');
assert.equal(resolveApiBaseUrl('https://api.example.test/api/v1/'), 'https://api.example.test/api/v1');
assert.doesNotMatch(publicPropertiesService, /do\s*\{[\s\S]*while\s*\(cursor\)/, 'Public listings must use bounded page requests.');
assert.match(marketingPages, /usePublicProperties\(\{ limit: ['"]3['"] \}\)/, 'The home page must request only its featured properties.');
assert.match(propertyPages, /data\?\.nextCursor[\s\S]*?onClick=\{loadMore\}/, 'Property discovery must expose cursor pagination.');
assert.equal(formatMinorMoney('40000', 'USD', 'en'), '$400');
assert.equal(formatMinorMoney('40050', 'USD', 'fr'), '400,50 $');
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
