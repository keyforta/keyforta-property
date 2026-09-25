import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Mirrors apps/portal-web/test/redesign/manager-kicker-contrast.test.js's
// coverage for the new Admin stylesheet
// (docs/product/ADMIN_REDESIGN_SPEC.md §2/§3 — the spec reuses Landlord's
// §3.1.1 contrast rules verbatim, so the same binding rule applies:
// burnished copper is never a text color at small sizes, aubergine is the
// approved kicker text color). Applicable here (not skipped) because
// AdminShell.jsx does render a `.kf-kicker` eyebrow element
// (`review.platform_administration` / the shared page-heading eyebrow) —
// the same reused element Landlord/Manager/Tenant already ship.
function relativeLuminance(hex) {
  const normalized = hex.replace('#', '');
  const channel = (value) => {
    const srgb = parseInt(value, 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(normalized.slice(0, 2));
  const g = channel(normalized.slice(2, 4));
  const b = channel(normalized.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA) + 0.05;
  const lumB = relativeLuminance(hexB) + 0.05;
  return lumA > lumB ? lumA / lumB : lumB / lumA;
}

describe('admin redesign.css kicker labels use a spec-compliant contrast pairing', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../src/redesign/admin/redesign.css'),
    'utf8',
  );

  function ruleBlock(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`selector not found: ${selector}`);
    return match[1];
  }

  it('does not use --kf-burnished-copper as the .kf-kicker text color', () => {
    const block = ruleBlock('.kf-admin-redesign .kf-kicker');
    expect(block).not.toMatch(/color:\s*var\(--kf-burnished-copper\)/);
  });

  it('uses --kf-aubergine as the kicker text color, which independently passes WCAG AA (>= 4.5:1) against a near-white background', () => {
    const block = ruleBlock('.kf-admin-redesign .kf-kicker');
    expect(block).toMatch(/color:\s*var\(--kf-aubergine\)/);
    expect(contrastRatio('#24162E', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('admin redesign.css stays scoped under .kf-admin-redesign', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../src/redesign/admin/redesign.css'),
    'utf8',
  );
  // Strip comments before scanning selectors so example selectors quoted
  // inside explanatory comments cannot produce a false positive/negative.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectorLines = withoutComments
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('{'))
    .map((line) => line.slice(0, -1).trim());

  it('has at least one selector to check (sanity check)', () => {
    expect(selectorLines.length).toBeGreaterThan(5);
  });

  it('every non-media/keyframe selector is scoped under .kf-admin-redesign (never bleeds into the unscoped legacy styles.css)', () => {
    const offenders = selectorLines.filter((selector) => (
      !selector.startsWith('@')
      && !selector.startsWith('.kf-admin-redesign')
    ));
    expect(offenders).toEqual([]);
  });
});
