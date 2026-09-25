import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// PO feedback (post-#139 polish): present all lists as tables, matching
// the Fluent UI table reference (https://storybooks.fluentui.dev/react/
// ?path=/docs/components-table--docs). The unit list is rendered by the
// checksum-protected, reused `apps/portal-web/src/property-management-
// panel.jsx` (see that file's own guard + statusTone.js's header comment
// on why this shell can never insert new child DOM nodes there), so a
// literal `<table>`/shared `<thead>` isn't achievable — this asserts the
// CSS-only Grid restyle that gives `.unit-rows`/`.unit-row` a genuine
// table look (bordered container, aligned columns, row dividers, hover
// highlight, per-row column captions standing in for a shared header)
// on the SAME reused elements. jsdom cannot lay out CSS Grid, so this is
// a static-source assertion (mirrors the pattern already used by
// pricing-availability-caption-layout.test.js and redesign-css-i18n.
// test.js for this same file).
describe('redesign.css restyles the unit list into a table-like CSS Grid layout', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../src/redesign/landlord/redesign.css'),
    'utf8',
  );

  it('gives the outer .unit-rows container a single bordered table-like surface', () => {
    const match = css.match(/\.kf-landlord-redesign \.unit-rows\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/border:\s*1px solid var\(--kf-aubergine-12\)/);
    expect(match[1]).toMatch(/overflow:\s*hidden/);
  });

  it('lays out each .unit-row on a fixed-column CSS Grid (name/type/status/action)', () => {
    // An earlier, legacy `.unit-row` rule (unrelated chrome-only tint,
    // pre-dating this fix) also matches this selector — the grid rule is
    // a later cascade override, so match every occurrence and find the
    // one that actually declares `display: grid`.
    const matches = [...css.matchAll(/\.kf-landlord-redesign \.unit-row\s*\{([^}]*)\}/g)];
    const gridRule = matches.find((m) => /display:\s*grid/.test(m[1]));
    expect(gridRule).not.toBeUndefined();
    expect(gridRule[1]).toMatch(/grid-template-columns:\s*minmax\(140px, 1\.4fr\) minmax\(90px, 0\.8fr\) minmax\(150px, 1fr\) auto/);
  });

  it('draws a row divider between units and highlights the row on hover/focus (table-row affordance)', () => {
    expect(css).toMatch(/\.kf-landlord-redesign \.unit-row \{[^}]*border-bottom:\s*1px solid var\(--kf-aubergine-12\);[^}]*\}/s);
    const hoverMatch = css.match(
      /\.kf-landlord-redesign \.unit-row:hover,\s*\n\.kf-landlord-redesign \.unit-row:focus-within\s*\{([^}]*)\}/,
    );
    expect(hoverMatch).not.toBeNull();
    expect(hoverMatch[1]).toMatch(/background:\s*var\(--kf-soft-bone\)/);
  });

  it('spans the reused pricing/listing-status blocks and second action button across every column', () => {
    const match = css.match(
      /\.kf-landlord-redesign \.unit-row > \.unit-pricing-availability,\s*\n\.kf-landlord-redesign \.unit-row > \.public-listing-status,\s*\n\.kf-landlord-redesign \.unit-row > form\.unit-form,\s*\n\.kf-landlord-redesign \.unit-row > button:nth-of-type\(2\)\s*\{([^}]*)\}/,
    );
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('adds Name/Type column captions (via ::before) alongside the existing Status caption', () => {
    expect(css).toMatch(
      /\.kf-landlord-redesign \.unit-row > span:first-child::before\s*\{\s*content:\s*var\(--kf-unit-name-label\);/,
    );
    expect(css).toMatch(
      /\.kf-landlord-redesign \.unit-row > span\.listing-meta:nth-child\(2\)::before\s*\{\s*content:\s*var\(--kf-unit-type-label\);/,
    );
  });
});
