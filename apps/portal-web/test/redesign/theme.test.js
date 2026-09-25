import { describe, expect, it } from 'vitest';
import { keyfortaBrand } from '@keyforta/brand';
import { landlordRedesignTheme, mineralTealRamp } from '../../src/redesign/landlord/theme.js';

// Contrast ratio helper mirroring the WCAG relative-luminance formula used
// in the spec's §3.1.1 table, so this test can independently re-verify the
// approved pairings rather than trusting the spec's prose.
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

describe('landlord redesign brand theme', () => {
  it('pins ramp step 80 (colorBrandBackground/colorBrandStroke1) to the exact approved mineralTeal hex', () => {
    // Fluent's own createLightTheme implementation maps colorBrandBackground,
    // colorBrandForeground1, and colorBrandStroke1 to brand[80] — see the
    // comment in theme.js. This is the one step that MUST reproduce the
    // approved hex exactly, not an interpolated approximation.
    expect(mineralTealRamp[80]).toBe(keyfortaBrand.colors.mineralTeal.toUpperCase());
  });

  it('produces a monotonically lightening ramp from step 160 (darkest) to step 10 (lightest)', () => {
    const steps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
    const luminances = steps.map((step) => relativeLuminance(mineralTealRamp[step]));
    for (let i = 1; i < luminances.length; i += 1) {
      expect(luminances[i]).toBeLessThanOrEqual(luminances[i - 1]);
    }
  });

  it('derives colorBrandBackground from the generated ramp so the theme actually uses the approved hex', () => {
    expect(landlordRedesignTheme.colorBrandBackground.toUpperCase()).toBe(keyfortaBrand.colors.mineralTeal.toUpperCase());
  });

  it('exposes the four approved brand surface colors verbatim (no ad hoc hex)', () => {
    expect(landlordRedesignTheme.colorPortalAubergine).toBe(keyfortaBrand.colors.aubergine);
    expect(landlordRedesignTheme.colorPortalMineralTeal).toBe(keyfortaBrand.colors.mineralTeal);
    expect(landlordRedesignTheme.colorPortalBurnishedCopper).toBe(keyfortaBrand.colors.burnishedCopper);
    expect(landlordRedesignTheme.colorPortalSoftBone).toBe(keyfortaBrand.colors.softBone);
  });

  it('confirms the §3.1.1 white-on-mineralTeal button text contrast pairing passes WCAG AA for normal text (>= 4.5:1)', () => {
    expect(contrastRatio('#FFFFFF', keyfortaBrand.colors.mineralTeal)).toBeGreaterThanOrEqual(4.5);
  });

  it('confirms the §3.1.1 aubergine-on-softBone text contrast pairing passes WCAG AA (>= 4.5:1)', () => {
    expect(contrastRatio(keyfortaBrand.colors.aubergine, keyfortaBrand.colors.softBone)).toBeGreaterThanOrEqual(4.5);
  });

  it('confirms the §3.1.1 aubergine-on-burnishedCopper badge text contrast pairing passes WCAG AA (>= 4.5:1)', () => {
    expect(contrastRatio(keyfortaBrand.colors.aubergine, keyfortaBrand.colors.burnishedCopper)).toBeGreaterThanOrEqual(4.5);
  });

  it('confirms mineralTeal text on softBone (small text) fails AA, per the spec §3.1.1 binding rule 1', () => {
    expect(contrastRatio(keyfortaBrand.colors.mineralTeal, keyfortaBrand.colors.softBone)).toBeLessThan(4.5);
  });

  // §11.4 — Fluent v9 Input/Select/Textarea render their *resting* (non
  // focused, non hovered) border from `colorNeutralStroke1` /
  // `colorNeutralStrokeAccessible` (confirmed against the compiled
  // @fluentui/react-input styles, see theme.js comment). The PO-visible
  // bug in the first §11 review was Fluent's default neutral gray showing
  // through untouched because only focus-ring tokens were themed. These
  // assertions pin the fix so a future edit can't silently regress back
  // to Fluent's stock gray without failing a test.
  it('overrides the resting-state neutral stroke tokens Input/Select/Textarea read for their default border (not just hover/focus)', () => {
    expect(landlordRedesignTheme.colorNeutralStroke1).toBeDefined();
    expect(landlordRedesignTheme.colorNeutralStrokeAccessible).toBeDefined();
    expect(landlordRedesignTheme.colorNeutralStroke1).not.toBe('#D1D1D1');
    expect(landlordRedesignTheme.colorNeutralStroke1.toLowerCase()).toContain('36, 22, 46');
    expect(landlordRedesignTheme.colorNeutralStrokeAccessible.toLowerCase()).toContain('36, 22, 46');
  });

  it('darkens the neutral stroke tokens progressively for hover/pressed states so resting state is visibly the lightest', () => {
    const parseAlpha = (rgba) => Number(rgba.match(/[\d.]+(?=\))/)[0]);
    expect(parseAlpha(landlordRedesignTheme.colorNeutralStroke1Hover)).toBeGreaterThan(parseAlpha(landlordRedesignTheme.colorNeutralStroke1));
    expect(parseAlpha(landlordRedesignTheme.colorNeutralStroke1Pressed)).toBeGreaterThan(parseAlpha(landlordRedesignTheme.colorNeutralStroke1Hover));
  });

  // Copilot PR #134 review finding #3: redesign.css's `--kf-aubergine-
  // muted-60` token (replacing the ad hoc `#8a8378`/`#6b6459` hex values
  // used for "unknown" checklist rows) must itself pass WCAG AA (>=
  // 4.5:1) for normal text against the white background it's actually
  // used on, not just look plausibly muted.
  it('confirms the §11.4/finding-3 aubergine-muted-60 token (rgba(36,22,46,0.6) on white) passes WCAG AA for normal text (>= 4.5:1)', () => {
    const blendOverWhite = (r, g, b, alpha) => [
      255 * (1 - alpha) + r * alpha,
      255 * (1 - alpha) + g * alpha,
      255 * (1 - alpha) + b * alpha,
    ];
    const toHex = ([r, g, b]) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
    const blended = toHex(blendOverWhite(36, 22, 46, 0.6));
    expect(contrastRatio(blended, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
