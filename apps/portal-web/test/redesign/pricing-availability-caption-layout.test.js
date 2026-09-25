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

  it('caps each grid column at a comfortable max width AND collapses unused tracks (auto-fit, not auto-fill)', () => {
    // PO feedback (PR #135, ergonomic + design-review polish passes):
    // an earlier revision capped the whole form/card at `max-width:
    // 520px`, which stopped fields from stretching but relocated the
    // "large dead area" complaint one level up (a narrow card floating
    // disconnected mid-row). Capping the column *size* instead
    // (`minmax(220px, 260px)`) fixed that, but `auto-fill` still
    // *reserves* as many 260px tracks as fit the row even when unused —
    // those invisible reserved tracks were the literal mechanical cause
    // of the still-visible "dead space to the right." Switching to
    // `auto-fit` collapses unused tracks to 0 width instead of reserving
    // them, while keeping the same per-column size cap (column
    // count/order/stacking is otherwise unchanged).
    const match = css.match(
      /\.kf-landlord-redesign \.unit-pricing-availability form\.unit-form\s*\{([^}]*)\}/,
    );
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(220px,\s*260px\)\)/);
  });

  it('gives each sub-form a soft-tinted surface (not white-on-white) for real visual grouping', () => {
    // Design review (PR #135 further polish): two white sub-forms on a
    // white outer card gave zero figure-ground contrast — "Pricing" and
    // "Availability" read as one undifferentiated block. Reuses this
    // file's existing white-outer/softBone-inner nesting idiom
    // (.property-row white containing .unit-row --kf-soft-bone) instead
    // of inventing a new pattern.
    const matches = [...css.matchAll(
      /\.kf-landlord-redesign \.unit-pricing-availability form\.unit-form\s*\{([^}]*)\}/g,
    )];
    const tintedRule = matches.find((m) => /background:\s*var\(--kf-soft-bone\)/.test(m[1]));
    expect(tintedRule).not.toBeUndefined();
    expect(tintedRule[1]).toMatch(/border-color:\s*transparent/);
  });

  it('merges the two tinted sub-forms into one continuous panel (no gap/radius between them) while keeping them as two distinguishable actions', () => {
    // PO feedback (PR #135 further polish): the two rounded, gapped
    // tinted boxes still read as two separate "cards." The two <form>
    // elements stay separate (two independent, protected commands —
    // merging actual submission behavior would mean editing the
    // protected property-management-panel.jsx and is out of scope
    // without explicit PO/spec sign-off), but their shared background
    // now forms one continuous surface: no gap between them, and
    // border-radius only at the very top/bottom of the pair.
    const matches = [...css.matchAll(
      /\.kf-landlord-redesign \.unit-pricing-availability form\.unit-form\s*\{([^}]*)\}/g,
    )];
    const tintedRule = matches.find((m) => /background:\s*var\(--kf-soft-bone\)/.test(m[1]));
    expect(tintedRule).not.toBeUndefined();
    expect(tintedRule[1]).toMatch(/border-radius:\s*0/);
    expect(tintedRule[1]).toMatch(/margin-top:\s*0/);
    expect(css).toMatch(
      /\.unit-pricing-availability form\.unit-form:first-of-type\s*\{[^}]*border-top-left-radius:\s*var\(--kf-radius-md\)/,
    );
    expect(css).toMatch(
      /\.unit-pricing-availability form\.unit-form:last-of-type\s*\{[^}]*border-bottom-left-radius:\s*var\(--kf-radius-md\)/,
    );
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

  it('resets the submit-button min-width to full-width/no-minimum at the existing 900px breakpoint styles.css already uses to collapse .unit-form to one column', () => {
    // Copilot PR #135 review, cycle-2 finding: a hard 260px min-width can
    // overflow a narrow mobile viewport. Reuses the existing 900px
    // breakpoint (protected styles.css collapses .unit-form to
    // grid-template-columns: 1fr there) instead of inventing a new one.
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{\s*\.kf-landlord-redesign \.unit-pricing-availability form\.unit-form button\[type='submit'\]\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/,
    );
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
