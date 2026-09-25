import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../src/i18n.js';
import { LandlordShell } from '../../src/redesign/landlord/LandlordShell.jsx';
import { poRegressionManagerListings, poRegressionRentalProperties } from '../../src/redesign/landlord/__fixtures__/poRegressionFixture.js';

// Regression guard for the PO's live-review finding: a unit's own
// `availabilityStatus` badge ("Available") and its listing's
// `status`/`mediaReviewStatus` badges ("Withdrawn"/"Media approved") are
// unrelated fields that can legitimately disagree, but the original
// §10.4/§11 visual chunking grouped them with no distinguishing caption,
// which the PO read as a contradiction/bug.
//
// PO follow-up feedback ("listing status, media should be also different
// columns") superseded the original fix: instead of a same-column
// caption (CSS `::before` content plus a JS-set `aria-label` override),
// "Status"/"Listing status"/"Media" are now three separate genuine
// `TableHeaderCell`/`TableCell` columns in property-management-panel.jsx
// — the column header itself is the (already fully accessible, no
// override needed) distinguishing label, so the earlier
// `--kf-unit-status-label`/`--kf-listing-status-label` CSS custom
// properties and the `aria-label`/`role="group"` annotations they drove
// were removed as redundant. This file now asserts the resulting column
// structure and content directly.
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

  it('renders "Listing status" and "Media" as their own real TableHeaderCells, distinct from "Status"', () => {
    const { container } = renderShell();
    const headerCells = Array.from(container.querySelectorAll('.unit-row-header th, .unit-row-header [role="columnheader"]')).map(
      (cell) => cell.textContent,
    );
    expect(headerCells).toContain('Status');
    expect(headerCells).toContain('Listing status');
    expect(headerCells).toContain('Media');
  });

  it('renders the fixture\'s exact PO-reported combination — unit "Available" alongside listing "Withdrawn"/"Media approved" — in their own distinct columns', () => {
    const { container } = renderShell();
    const unitStatus = container.querySelector('.unit-row > .status:not(.listing-status)');
    const listingStatus = container.querySelector('.unit-row > .status.listing-status');
    const mediaStatus = container.querySelector('.unit-row > .media-status');
    expect(unitStatus.textContent).toBe('Available');
    expect(listingStatus.textContent).toBe('Withdrawn');
    expect(mediaStatus.textContent).toBe('Media approved');
  });

  // PO feedback ("combine Listing publication and Property portfolio in
  // the same table"): a withdrawn listing's own Actions cell now renders
  // the Publish command inline, reusing listing-publication-panel.jsx's
  // `statusCopy` mapping/i18n keys, instead of requiring a separate
  // "Publish or withdraw assigned listings" table for the same listing.
  it('renders an inline "Publish" action for the withdrawn listing in its own row\'s Actions cell', () => {
    const { container } = renderShell();
    const actionsCell = container.querySelector('.unit-row > .unit-row-actions');
    expect(actionsCell).toBeTruthy();
    expect(actionsCell.textContent).toContain('Publish');
  });

  // Copilot PR #134 review finding #2: the withdrawn listing's `.status`
  // badge in this exact fixture must be annotated `data-kf-tone="negative"`
  // (so redesign.css can give it a non-green tone), while the unit's own
  // "Available" `.status` badge — a genuinely positive value — must not
  // be.
  it('annotates the withdrawn listing\'s status column with data-kf-tone="negative" but leaves the unit\'s "Available" status column untouched', () => {
    const { container } = renderShell();
    const unitStatus = container.querySelector('.unit-row > .status:not(.listing-status)');
    const listingStatus = container.querySelector('.unit-row > .status.listing-status');
    expect(unitStatus.textContent).toBe('Available');
    expect(unitStatus.getAttribute('data-kf-tone')).toBeNull();
    expect(listingStatus.textContent).toBe('Withdrawn');
    expect(listingStatus.getAttribute('data-kf-tone')).toBe('negative');
  });

  // Copilot PR #134 review, remediation cycle 2, finding #1 — superseded:
  // PO feedback ("combine Listing publication and Property portfolio in
  // the same table") removed the separate `ListingPublicationPanel`
  // sibling entirely, so the withdrawn listing's badge now renders in
  // exactly one place (this table's own "Listing status" column,
  // asserted above) — there is no second DOM copy left to annotate.
});
