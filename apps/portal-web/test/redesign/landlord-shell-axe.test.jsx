import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import i18n from '../../src/i18n.js';
import { LandlordShell } from '../../src/redesign/landlord/LandlordShell.jsx';
import { poRegressionManagerListings, poRegressionRentalProperties } from '../../src/redesign/landlord/__fixtures__/poRegressionFixture.js';

// Copilot PR #134 review, remediation cycle 2, finding #2: the reused
// panels/existing (flag-off) shell already have axe smoke coverage
// (test/portal.test.jsx, test/property-management.test.jsx,
// test/listing-publication.test.jsx), but the new flag-on `LandlordShell`
// composition — new sidebar nav, checklist card/buttons, status-caption
// semantics layered onto the reused panels — had none, so an a11y
// regression introduced only by this new composition could pass every
// existing test. Rendered directly (same pattern as
// status-label-distinction.test.jsx) rather than through the full
// `Portal`/hooks stack, so the "populated" case can use real fixture data
// deterministically without needing a live/mocked API session.
function renderShell({ managerListings, rentalProperties }) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <LandlordShell
        active='properties'
        completedAction=''
        listingPublicationEmptyState='Assigned listings will appear here.'
        managerListings={managerListings}
        managerListingsError={null}
        managerListingsLoading={false}
        navKeys={['overview', 'properties']}
        onComplete={() => {}}
        onLogout={() => {}}
        onSetActive={() => {}}
        onToggleLanguage={() => {}}
        rentalProperties={rentalProperties}
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

describe('LandlordShell (flag on) accessibility smoke', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('has no critical accessibility violations in the empty state (no properties/listings yet)', async () => {
    const { container } = renderShell({ managerListings: [], rentalProperties: [] });
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no critical accessibility violations with a populated/expanded fixture (property/unit/listing cards, mixed checklist statuses, status-distinction captions)', async () => {
    const { container } = renderShell({
      managerListings: poRegressionManagerListings,
      rentalProperties: poRegressionRentalProperties,
    });
    expect((await axe(container)).violations).toEqual([]);
  });
});
