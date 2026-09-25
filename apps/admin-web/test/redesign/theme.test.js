import { describe, expect, it } from 'vitest';
import { keyfortaBrand } from '@keyforta/brand';
import { adminRedesignTheme, generateBrandRamp, mineralTealRamp } from '../../src/redesign/admin/theme.js';

// Mirrors apps/portal-web/test/redesign/theme.test.js's coverage for the
// Landlord redesign's brand theme (finding #4 of the Copilot PR #139
// review): `generateBrandRamp`/`mineralTealRamp` are duplicated,
// deterministic code (per theme.js's header comment, the labeled
// reversible engineering default for Admin) but had zero Admin-side test
// coverage before this file.
describe('admin redesign brand theme', () => {
  it('generates all 16 documented ramp steps', () => {
    const steps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
    const ramp = generateBrandRamp(keyfortaBrand.colors.mineralTeal);
    expect(Object.keys(ramp).map(Number).sort((a, b) => a - b)).toEqual(steps);
    for (const step of steps) {
      expect(ramp[step]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('pins ramp step 80 (colorBrandBackground/colorBrandStroke1) to the exact approved mineralTeal hex', () => {
    // Fluent's own createLightTheme implementation maps colorBrandBackground,
    // colorBrandForeground1, and colorBrandStroke1 to brand[80] — see the
    // comment in theme.js. This is the one step that MUST reproduce the
    // approved hex exactly, not an interpolated approximation.
    expect(mineralTealRamp[80]).toBe(keyfortaBrand.colors.mineralTeal.toUpperCase());
  });

  it('derives colorBrandBackground from the generated ramp so the theme actually uses the approved hex', () => {
    expect(adminRedesignTheme.colorBrandBackground.toUpperCase()).toBe(keyfortaBrand.colors.mineralTeal.toUpperCase());
  });

  it('exposes the four approved brand surface colors verbatim (no ad hoc hex)', () => {
    expect(adminRedesignTheme.colorPortalAubergine).toBe(keyfortaBrand.colors.aubergine);
    expect(adminRedesignTheme.colorPortalMineralTeal).toBe(keyfortaBrand.colors.mineralTeal);
    expect(adminRedesignTheme.colorPortalBurnishedCopper).toBe(keyfortaBrand.colors.burnishedCopper);
    expect(adminRedesignTheme.colorPortalSoftBone).toBe(keyfortaBrand.colors.softBone);
  });
});
