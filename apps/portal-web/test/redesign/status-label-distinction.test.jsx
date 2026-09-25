import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../src/i18n.js';
import { LandlordShell } from '../../src/redesign/landlord/LandlordShell.jsx';
import { poRegressionManagerListings, poRegressionRentalProperties } from '../../src/redesign/landlord/__fixtures__/poRegressionFixture.js';

// Regression guard for the PO's live-review finding: a unit's own
// `availabilityStatus` badge ("Available") and its listing's
// `status`/`mediaReviewStatus` badges ("Withdrawn"/"Media approved") are
// unrelated fields that can legitimately disagree, but the §10.4/§11
// visual chunking grouped them with no distinguishing caption, which the
// PO read as a contradiction/bug. LandlordShell fixes this by exposing
// two translated CSS custom properties (`--kf-unit-status-label`/
// `--kf-listing-status-label`) on the one wrapper `<div>` it owns around
// the reused, unmodified PropertyManagementPanel — redesign.css reads
// these via `content: var(...)` to render a caption before each group.
// jsdom does not compute pseudo-element `content`, so this test asserts
// the JS-side wiring directly (the part this shell actually controls);
// the Playwright spec asserts the resulting rendered `::before` content
// in a real browser using this exact fixture data.
function renderShell() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <LandlordShell
        active='properties'
        completedAction=''
        listingPublicationEmptyState='Assigned listings will appear here.'
        managerListings={poRegressionManagerListings}
        managerListingsError={null}
        managerListingsLoading={false}
        navKeys={['overview', 'properties']}
        onComplete={() => {}}
        onLogout={() => {}}
        onSetActive={() => {}}
        onToggleLanguage={() => {}}
        rentalProperties={poRegressionRentalProperties}
        rentalPropertiesError={null}
        rentalPropertiesLoading={false}
        retryManagerListings={() => {}}
        retryRentalProperties={() => {}}
        role={{
          eyebrow: 'Owner workspace',
          title: 'Properties',
          summary: 'Your properties records and actions.',
          nav: ['Overview', 'Properties'],
          statsEmptyState: 'Stats unavailable.',
          rowsEmptyState: 'Nothing needs attention yet.',
        }}
        roleActions={['Add a property']}
        session={{ email: 'demo.landlord@test.keyforta.com', role: 'landlord', sessionMode: 'demo' }}
        showListingPublication
        showPropertyManagement
      />
    </FluentProvider>,
  );
}

describe('unit-status vs listing-status caption distinction (PO regression fix)', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('exposes distinct, non-empty translated CSS custom properties for the unit-status and listing-status caption groups', () => {
    const { container } = renderShell();
    const anchor = container.querySelector('#kf-property-management-anchor');
    expect(anchor).toBeTruthy();
    const unitLabel = anchor.style.getPropertyValue('--kf-unit-status-label');
    const listingLabel = anchor.style.getPropertyValue('--kf-listing-status-label');
    expect(unitLabel).toBe('"Unit status"');
    expect(listingLabel).toBe('"Listing status"');
    // The two captions must never collapse to the same text — that would
    // silently reintroduce the exact ambiguity this fix addresses.
    expect(unitLabel).not.toBe(listingLabel);
  });

  // Copilot PR #134 review, cycle-3/4 finding #5: the Pricing/Availability
  // sub-form captions must also be JS-translated CSS custom properties
  // (reusing the existing `property_management.pricing_form_label`/
  // `availability_form_label` keys), never a hardcoded English `content:`
  // string in redesign.css.
  it('exposes translated CSS custom properties for the pricing/availability sub-form captions, reusing the existing property_management i18n keys', () => {
    const { container } = renderShell();
    const anchor = container.querySelector('#kf-property-management-anchor');
    expect(anchor.style.getPropertyValue('--kf-pricing-form-label')).toBe('"Pricing"');
    expect(anchor.style.getPropertyValue('--kf-availability-form-label')).toBe('"Availability"');
  });

  it('renders the fixture\'s exact PO-reported combination — unit "Available" alongside listing "Withdrawn"/"Media approved" — so the distinguishing captions have something real to disambiguate', () => {
    const { container } = renderShell();
    const unitStatus = container.querySelector('.unit-row > .status');
    const listingStatusGroup = container.querySelector('.public-listing-status');
    expect(unitStatus.textContent).toContain('Available');
    expect(listingStatusGroup.textContent).toContain('Withdrawn');
    expect(listingStatusGroup.textContent).toContain('Media approved');
  });

  it('re-translates both captions when the language changes, via the same i18n instance the rest of the app already uses', async () => {
    await i18n.changeLanguage('fr');
    const { container } = renderShell();
    const anchor = container.querySelector('#kf-property-management-anchor');
    expect(anchor.style.getPropertyValue('--kf-unit-status-label')).toBe('"Statut de l\'unité"');
    expect(anchor.style.getPropertyValue('--kf-listing-status-label')).toBe('"Statut de l\'annonce"');
  });

  // Copilot PR #134 review, cycle-3/4 finding #6: the CSS `::before`
  // captions above are real but not reliably exposed to assistive
  // technology — screen readers must get the same "Unit status" /
  // "Listing status" distinction via real DOM/ARIA, not CSS-only content.
  it('exposes an accessible "Unit status: <value>" name on the unit\'s own status badge', () => {
    const { container } = renderShell();
    const unitStatus = container.querySelector('.unit-row > .status');
    expect(unitStatus.getAttribute('aria-label')).toBe('Unit status: Available');
  });

  it('exposes the listing-status group as an accessible group named "Listing status"', () => {
    const { container } = renderShell();
    const listingStatusGroup = container.querySelector('.public-listing-status');
    expect(listingStatusGroup.getAttribute('role')).toBe('group');
    expect(listingStatusGroup.getAttribute('aria-label')).toBe('Listing status');
  });

  it('re-translates the accessible labels when the language changes', async () => {
    await i18n.changeLanguage('fr');
    const { container } = renderShell();
    const unitStatus = container.querySelector('.unit-row > .status');
    const listingStatusGroup = container.querySelector('.public-listing-status');
    expect(unitStatus.getAttribute('aria-label')).toBe('Statut de l\'unité: Disponible');
    expect(listingStatusGroup.getAttribute('aria-label')).toBe('Statut de l\'annonce');
  });

  // Copilot PR #134 review finding #2: the withdrawn listing's `.status`
  // badge in this exact fixture must be annotated `data-kf-tone="negative"`
  // (so redesign.css can give it a non-green tone), while the unit's own
  // "Available" `.status` badge — a genuinely positive value — must not
  // be.
  it('annotates the withdrawn listing\'s .status badge with data-kf-tone="negative" but leaves the unit\'s "Available" badge untouched', () => {
    const { container } = renderShell();
    const unitStatus = container.querySelector('.unit-row > .status');
    const listingStatus = container.querySelector('.public-listing-status .status');
    expect(unitStatus.textContent).toBe('Available');
    expect(unitStatus.getAttribute('data-kf-tone')).toBeNull();
    expect(listingStatus.textContent).toBe('Withdrawn');
    expect(listingStatus.getAttribute('data-kf-tone')).toBe('negative');
  });

  // Copilot PR #134 review, remediation cycle 2, finding #1: the same
  // withdrawn listing is ALSO rendered (as its own, separate DOM copy) by
  // `ListingPublicationPanel`, a sibling of the property-management
  // anchor rather than a descendant of it — the annotation must cover
  // that copy too, not just the one nested inside
  // PropertyManagementPanel's read-only PublicListingForm.
  it('also annotates the withdrawn listing\'s badge as rendered by the separate, sibling ListingPublicationPanel', () => {
    const { container } = renderShell();
    const publicationPanelStatus = container.querySelector('.listing-row .status');
    expect(publicationPanelStatus).toBeTruthy();
    expect(publicationPanelStatus.textContent).toBe('Withdrawn');
    expect(publicationPanelStatus.getAttribute('data-kf-tone')).toBe('negative');
  });
});
