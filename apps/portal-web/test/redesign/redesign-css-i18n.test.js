import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Copilot PR #134 review, cycle-3/4 finding #5: several CSS-generated
// pseudo-heading captions (`::before` `content:`) were hardcoded English
// literals layered on top of controls that are either (a) already
// visibly, accessibly localized by the reused, protected
// `property-management-panel.jsx` itself (the "Manage this unit" and
// "Photos" captions duplicated its own `<h3>{t('manage_unit_title')}`/
// `t('listing_images_title')}</h3>` headings), or (b) genuinely new
// visual sub-dividers with no equivalent localized/visible text
// ("Pricing"/"Availability" section labels), which must use the SAME
// JS-side-translated-CSS-custom-property technique already used for the
// unit-status/listing-status captions, reusing the exact SAME existing
// `property_management.pricing_form_label`/`availability_form_label` i18n
// keys already used for those forms' (screen-reader-only) `aria-label`s
// — never a new hardcoded English `content:` string.
describe('redesign.css no longer hardcodes English literals for generated section labels', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../src/redesign/landlord/redesign.css'),
    'utf8',
  );

  it('does not duplicate the "Manage this unit" caption (the protected panel already renders its own localized, visible <h3> heading there)', () => {
    expect(css).not.toContain("content: 'Manage this unit'");
  });

  it('does not duplicate the "Photos" caption (the protected panel already renders its own localized, visible <h3> heading there)', () => {
    expect(css).not.toContain("content: 'Photos'");
  });

  it('does not hardcode English "Pricing"/"Availability" literals; both read from JS-populated CSS custom properties instead', () => {
    expect(css).not.toContain("content: 'Pricing'");
    expect(css).not.toContain("content: 'Availability'");
    expect(css).toContain('content: var(--kf-pricing-form-label)');
    expect(css).toContain('content: var(--kf-availability-form-label)');
  });
});
