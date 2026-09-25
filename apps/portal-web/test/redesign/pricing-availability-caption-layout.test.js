import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Bug fix (post-#134 polish, PO report): the "Set pricing & availability"
// panel's section captions (`.unit-pricing-availability form.unit-form
// ::before`) rendered BESIDE the form's fields instead of ABOVE them as a
// heading, and the availability caption's `border-top` "divider" rendered
// as a short, disconnected line floating in its own grid column, because
// the protected base `apps/portal-web/src/styles.css` defines
// `.unit-form { display: grid; grid-template-columns: repeat(auto-fill,
// minmax(220px, 1fr)); }` and the `::before` pseudo-element (a grid item,
// first in document order, with no explicit `grid-column`) was auto-
// placed into its own column rather than spanning the row.
//
// This is a static-source assertion (mirrors the pattern in
// redesign-css-i18n.test.js) confirming the additive `grid-column: 1 / -1`
// fix is present on both section-caption rules — jsdom cannot lay out
// CSS Grid, so the real-browser bounding-box/visual assertion lives in
// e2e/redesign/landlord.spec.ts instead.
describe('redesign.css unit-pricing-availability section captions span the full grid row', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../src/redesign/landlord/redesign.css'),
    'utf8',
  );

  const captionRuleRegex = (nth) => new RegExp(
    String.raw`\.unit-pricing-availability form\.unit-form:nth-of-type\(${nth}\)::before\s*\{([^}]*)\}`,
  );

  it('makes the pricing (form 1) caption span every auto-fill column via grid-column: 1 / -1', () => {
    const match = css.match(captionRuleRegex(1));
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('makes the availability (form 2) caption span every auto-fill column via grid-column: 1 / -1', () => {
    const match = css.match(captionRuleRegex(2));
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('also spans the submit buttons across the full row and pins a shared min-width so both buttons render at a consistent size', () => {
    expect(css).toMatch(
      /\.unit-pricing-availability form\.unit-form button\[type='submit'\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*min-width:\s*180px/,
    );
  });

  it('gives the trailing Cancel button (last button[type="button"] child of .unit-pricing-availability) a visible border/padding affordance', () => {
    expect(css).toMatch(
      /\.unit-pricing-availability > button\[type='button'\]:last-child\s*\{[^}]*border:\s*1px solid var\(--kf-aubergine-12\)/,
    );
  });
});
