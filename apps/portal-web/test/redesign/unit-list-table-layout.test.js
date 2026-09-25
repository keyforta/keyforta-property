import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// PO feedback ("use fluent table"): the unit list is rendered by the
// checksum-protected, reused `apps/portal-web/src/property-management-
// panel.jsx`. An earlier round of this same feedback loop restyled the
// then-plain-div `.unit-rows`/`.unit-row` markup to LOOK like a table via
// CSS Grid alone, since that file could receive no new child DOM at the
// time. This round genuinely converts that markup: property-management-
// panel.jsx now renders a real `@fluentui/react-components` `<Table
// noNativeElements>` (ARIA `role="table"`/`"row"`/`"columnheader"`/
// `"cell"`, still plain `<div>`s under the hood, so this file's existing
// CSS Grid column layout keeps working unchanged) with a genuine
// `<TableHeader>` row — see that file's own JSX for the structural change
// and status-label-distinction.test.jsx for the still-required per-row
// unit/listing-status disambiguation this change preserves. jsdom cannot
// lay out CSS Grid, so this remains a static-source assertion (mirrors
// the pattern already used by pricing-availability-caption-layout.test.js
// for this same file).
describe('redesign.css lays out the genuine Fluent Table unit list on a CSS Grid (name/type/status/listing-status/media/actions columns)', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../src/redesign/landlord/redesign.css'),
    'utf8',
  );
  const panelSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/property-management-panel.jsx'),
    'utf8',
  );

  it('gives the outer .unit-rows container a single bordered table-like surface', () => {
    const match = css.match(/\.kf-landlord-redesign \.unit-rows\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/border:\s*1px solid var\(--kf-aubergine-08\)/);
    expect(match[1]).toMatch(/overflow:\s*hidden/);
  });

  it('lays out each .unit-row (header and body) on a fixed 6-column CSS Grid (name/type/status/listing-status/media/actions)', () => {
    // An earlier, legacy `.unit-row` rule (unrelated chrome-only tint,
    // pre-dating this fix) also matches this selector — the grid rule is
    // a later cascade override, so match every occurrence and find the
    // one that actually declares `display: grid`.
    const matches = [...css.matchAll(/\.kf-landlord-redesign \.unit-row\s*\{([^}]*)\}/g)];
    const gridRule = matches.find((m) => /display:\s*grid/.test(m[1]));
    expect(gridRule).not.toBeUndefined();
    expect(gridRule[1]).toMatch(
      /grid-template-columns:\s*minmax\(140px, 1\.4fr\) minmax\(90px, 0\.8fr\) minmax\(120px, 0\.9fr\) minmax\(120px, 0\.9fr\) minmax\(120px, 0\.9fr\) minmax\(260px, 1\.6fr\)/,
    );
  });

  it('draws a row divider between units and highlights the row on hover/focus with a subtle neutral tint (table-row affordance)', () => {
    expect(css).toMatch(/\.kf-landlord-redesign \.unit-row \{[^}]*border-bottom:\s*1px solid var\(--kf-aubergine-08\);[^}]*\}/s);
    const hoverMatch = css.match(
      /\.kf-landlord-redesign \.unit-row:hover,\s*\n\.kf-landlord-redesign \.unit-row:focus-within\s*\{([^}]*)\}/,
    );
    expect(hoverMatch).not.toBeNull();
    expect(hoverMatch[1]).toMatch(/background:\s*rgba\(36,\s*22,\s*46,\s*0\.04\)/);
  });

  it('stacks the Actions column contents (reused pricing/availability + listing forms) vertically within their own cell, not spanning every column', () => {
    const match = css.match(/\.kf-landlord-redesign \.unit-row-actions\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/display:\s*flex/);
    expect(match[1]).toMatch(/flex-direction:\s*column/);
  });

  it('shades the genuine header row as a distinct band with a bolder divider beneath it (matching the Fluent Table reference)', () => {
    const match = css.match(/\.kf-landlord-redesign \.unit-row-header\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/background:\s*#faf9f8/);
    expect(match[1]).toMatch(/border-bottom:\s*1px solid var\(--kf-aubergine-12\)/);
  });

  it('renders a genuine Fluent <Table> with a real <TableHeader>/<TableHeaderCell> row (not a CSS-only approximation) around the unit list', () => {
    expect(panelSource).toMatch(/<Table aria-label=\{t\('property_management\.units_table_label'\)\} className='unit-rows' noNativeElements>/);
    expect(panelSource).toMatch(/<TableHeader>/);
    expect(panelSource).toMatch(/<TableRow className='unit-row unit-row-header'>/);
    expect(panelSource).toMatch(/<TableHeaderCell>\{t\('property_management\.unit_table_column_unit'\)\}<\/TableHeaderCell>/);
    expect(panelSource).toMatch(/<TableHeaderCell>\{t\('property_management\.unit_table_column_type'\)\}<\/TableHeaderCell>/);
    expect(panelSource).toMatch(/<TableHeaderCell>\{t\('property_management\.unit_table_column_status'\)\}<\/TableHeaderCell>/);
    expect(panelSource).toMatch(/<TableHeaderCell>\{t\('property_management\.unit_table_column_listing_status'\)\}<\/TableHeaderCell>/);
    expect(panelSource).toMatch(/<TableHeaderCell>\{t\('property_management\.unit_table_column_media'\)\}<\/TableHeaderCell>/);
    expect(panelSource).toMatch(/<TableHeaderCell>\{t\('property_management\.unit_table_column_actions'\)\}<\/TableHeaderCell>/);
  });

  it('renders each unit as a real <TableRow>/<TableCell> body row (name/type/status/listing-status/media/actions), not a plain div/span row', () => {
    expect(panelSource).toMatch(/<TableRow className='unit-row' key=\{unit\.id\}>/);
    expect(panelSource).toMatch(/<TableCell className='unit-row-name'>\{unit\.label\}<\/TableCell>/);
    expect(panelSource).toMatch(/<TableCell className='listing-meta'>\{t\(`property_management\.unit_type\.\$\{unit\.unitType\}`\)\}<\/TableCell>/);
    expect(panelSource).toMatch(/<TableCell className='status'>\{t\(`property_management\.unit_availability_status\.\$\{unit\.availabilityStatus\}`\)\}<\/TableCell>/);
    expect(panelSource).toMatch(/<TableCell className='status listing-status'>/);
    expect(panelSource).toMatch(/<TableCell className='listing-meta media-status'>/);
    expect(panelSource).toMatch(/<TableCell className='unit-row-actions'>/);
  });
});
