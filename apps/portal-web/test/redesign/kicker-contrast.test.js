import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Copilot PR #134 review, cycle-3/4 finding #4: 12px kicker labels used
// `burnishedCopper` text color on an almost-white (12%-tinted) background
// — per docs/product/LANDLORD_REDESIGN_SPEC.md §3.1.1's own contrast
// table, `burnishedCopper` on a light/white-ish surface is only ~3.37:1
// (white | burnishedCopper), which fails WCAG AA for normal/small text
// (needs >= 4.5:1); `burnishedCopper` on `softBone` is even worse
// (2.92:1). The spec's binding rule 3 states copper is "never a text
// color on softBone" and its only approved small-text-adjacent use is (c)
// "a badge/chip background with aubergine text (5.07:1, passes)".
//
// Contrast ratio helper mirrors theme.test.js's (WCAG relative-luminance
// formula) so this test independently re-verifies the pairing rather than
// trusting the spec's prose alone.
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

describe('redesign.css kicker labels use a spec-compliant contrast pairing', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../src/redesign/landlord/redesign.css'),
    'utf8',
  );

  function ruleBlock(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`selector not found: ${selector}`);
    return match[1];
  }

  it('does not use --kf-burnished-copper as the .kf-kicker text color (fails AA at 12px per the spec\'s own contrast table)', () => {
    const block = ruleBlock('.kf-landlord-redesign .kf-kicker');
    expect(block).not.toMatch(/color:\s*var\(--kf-burnished-copper\)/);
  });

  it('does not use --kf-burnished-copper as the .kf-topbar-kicker text color', () => {
    const block = ruleBlock('.kf-landlord-redesign .kf-topbar-kicker');
    expect(block).not.toMatch(/color:\s*var\(--kf-burnished-copper\)/);
  });

  it('uses --kf-aubergine as the kicker text color, which independently passes WCAG AA (>= 4.5:1) against a near-white background', () => {
    const block = ruleBlock('.kf-landlord-redesign .kf-kicker');
    expect(block).toMatch(/color:\s*var\(--kf-aubergine\)/);
    expect(contrastRatio('#24162E', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
