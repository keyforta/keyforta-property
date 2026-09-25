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

  it('also spans the submit buttons across the full row and pins a shared min-width wide enough for the longest approved fr/en label', () => {
    // Copilot PR #135 review, cycle-1 finding: a bare min-width is only a
    // lower bound with justify-self:start — it must be raised past the
    // English-only guess to actually accommodate the longest currently
    // approved translation ("Mettre à jour la disponibilité", fr), not
    // just the shorter English labels.
    const match = css.match(
      /\.unit-pricing-availability form\.unit-form button\[type='submit'\]\s*\{([^}]*)\}/,
    );
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    const minWidthMatch = match[1].match(/min-width:\s*(\d+)px/);
    expect(minWidthMatch).not.toBeNull();
    expect(Number(minWidthMatch[1])).toBeGreaterThanOrEqual(260);
  });

  it('does not add a border/background to the Cancel button, preserving the approved borderless "subtle" spec (LANDLORD_REDESIGN_SPEC.md §5.1)', () => {
    // Copilot PR #135 review, cycle-1 finding: an earlier version of this
    // fix added a visible border to the Cancel button, but the approved
    // redesign spec explicitly documents `subtle` (Cancel/nav/sign-out/
    // language toggle) as "Transparent fill ... no border" — that is
    // intentional, not a bug, so this fix must not override it without a
    // separate, explicit spec change and product-owner approval.
    expect(css).not.toMatch(
      /\.unit-pricing-availability[^{]*button\[type='button'\][^{]*\{[^}]*border:\s*1px solid/,
    );
  });
});
