import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Copilot PR #134 review, cycle-3/4 finding #1: "keep all redesign code
// behind the lazy import". The redesign's JS/CSS/image assets were
// already confirmed (via `vite build` chunk inspection) to load only
// inside the `React.lazy(() => import('./redesign/landlord/index.jsx'))`
// chunk — but the redesign's own translated copy (the
// `landlord_redesign.*` i18n namespace) previously lived inside
// `src/locales/en.json`/`fr.json`, which `src/i18n.js` imports eagerly at
// the top of `portal-app.jsx` for EVERY session regardless of role or
// flag state. That copy therefore shipped to every user's main entry
// chunk even when `VITE_REDESIGN_ENABLED` is off, undermining the
// "brand assets in lazy chunk" acceptance criterion (zero bytes of
// redesign-specific content when the flag is off).
//
// Fix: the `landlord_redesign` namespace now lives only in
// `src/redesign/landlord/locales/{en,fr}.json` (files that live INSIDE
// the lazy-loaded module tree — imported only by
// `src/redesign/landlord/index.jsx`) and is registered into the shared
// i18n instance via `i18n.addResourceBundle(...)` only when that chunk's
// module actually evaluates (i.e. only once the flag is on and a
// landlord session reaches it).
describe('landlord-redesign translation copy stays inside the lazy chunk boundary', () => {
  it('is absent from the always-loaded shared locale files', () => {
    const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/locales/en.json'), 'utf8'));
    const fr = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/locales/fr.json'), 'utf8'));
    expect(en.landlord_redesign).toBeUndefined();
    expect(fr.landlord_redesign).toBeUndefined();
  });

  it('lives instead in the redesign directory\'s own locale resource files', () => {
    const en = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/redesign/landlord/locales/en.json'), 'utf8'),
    );
    const fr = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/redesign/landlord/locales/fr.json'), 'utf8'),
    );
    expect(en.landlord_redesign.checklist.title_before_published).toBe('Get your first listing live');
    expect(fr.landlord_redesign.checklist.title_before_published).toBe('Publiez votre première annonce');
  });

  it('is unresolved on the shared i18n instance until the lazy redesign module is imported, then resolves once it is', async () => {
    const i18n = (await import('../../src/i18n.js')).default;
    expect(i18n.exists('landlord_redesign.checklist.title_before_published')).toBe(false);

    await import('../../src/redesign/landlord/index.jsx');

    expect(i18n.t('landlord_redesign.checklist.title_before_published')).toBe('Get your first listing live');
  });
});

// Copilot PR #134 review, cycle-4 finding #1 (comment 4099022183): "this
// static import pulls `src/redesign/landlord/flags.js` into and evaluates
// it as part of the main portal bundle on every flag-off load [...] Move
// the flag predicate to a non-redesign feature-flags module or inline it
// in `portal-app.jsx` so the redesign directory remains entirely behind
// the lazy import." The i18n-namespace fix above did not address this: the
// flag predicate itself still lived at
// `src/redesign/landlord/flags.js` and was reached via a top-level, static
// `import { isLandlordRedesignEnabled } from './redesign/landlord/flags.js'`
// in `portal-app.jsx` — a real ES module graph edge from the always-loaded
// entry file into the redesign directory, independent of whatever a given
// bundler's minifier/tree-shaker happens to fold away in one particular
// build. This test asserts that edge does not exist at the source level,
// so the guarantee holds regardless of build tooling/config.
describe('portal-app.jsx has no static (eager) import into the redesign directory', () => {
  const portalAppSource = fs.readFileSync(path.resolve(__dirname, '../../src/portal-app.jsx'), 'utf8');

  // Matches only genuine static `import ... from '...'` declarations (which
  // are hoisted and evaluated eagerly by the module system), not the
  // `import('./redesign/landlord/index.jsx')` dynamic-import call used by
  // `lazy(...)`, which is intentionally the sole entry point into the
  // redesign directory.
  const staticImportSpecifiers = [...portalAppSource.matchAll(/^import\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm)]
    .map((match) => match[1]);

  it('collects at least one static import specifier (sanity check the regex above still matches this file)', () => {
    expect(staticImportSpecifiers.length).toBeGreaterThan(0);
  });

  it('has no static import specifier that resolves into ./redesign/landlord', () => {
    const redesignStaticImports = staticImportSpecifiers.filter((specifier) => specifier.includes('redesign/landlord'));
    expect(redesignStaticImports).toEqual([]);
  });

  it('still reaches the redesign directory exactly once, via the lazy() dynamic import', () => {
    expect(portalAppSource).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\/redesign\/landlord\/index\.jsx['"]\)\)/);
  });

  it('does not import src/redesign/landlord/flags.js from anywhere outside the redesign directory', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../../src/redesign/landlord/flags.js'))).toBe(false);
  });
});
