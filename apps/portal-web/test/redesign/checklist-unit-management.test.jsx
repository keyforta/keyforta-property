import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n.js';
import { LandlordShell } from '../../src/redesign/landlord/LandlordShell.jsx';

// Copilot PR #134 review, cycle-3/4 finding #3: spec §10.2 — clicking
// "Set pricing & availability" must, when exactly one property/unit
// exists, ALSO open that unit's existing "Manage this unit" toggle
// (property-management-panel.jsx's own `UnitPricingAvailabilityForm`,
// unmodified), not just scroll. `LandlordShell` is rendered directly
// (same pattern as status-label-distinction.test.jsx/landlord-shell-axe.
// test.jsx) with a deterministic single-property/single-unit fixture so
// this exact condition is met, rather than going through the full
// `Portal`/hooks stack (whose `useRentalProperties` always resolves to
// `[]` for demo sessions without a real access-token getter).
const soleProperty = [
  {
    id: 'b1e6f8b0-2f5f-4c2a-9d3b-6b9a2b4f0d11',
    name: 'Riverside Apartments',
    propertyType: 'apartment_building',
    address: {
      avenueOrStreet: 'Avenue de la Paix',
      number: '12',
      quartier: 'Gombe',
      commune: 'Gombe',
      city: 'Kinshasa',
      province: 'Kinshasa',
      countryCode: 'CD',
    },
    timeZone: 'Africa/Kinshasa',
    jurisdictionCode: null,
    verificationStatus: 'not_started',
    publicationStatus: 'draft',
    version: 1,
    archivedAt: null,
    units: [
      {
        id: 'e2c1a3f4-5b6c-4d7e-8f9a-0b1c2d3e4f56',
        label: 'Unit 2A',
        unitType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        areaSquareMeters: null,
        floorLabel: null,
        furnishingStatus: 'unfurnished',
        availabilityStatus: 'available',
        publicationStatus: 'draft',
        version: 1,
        archivedAt: null,
      },
    ],
  },
];

function renderShell({ rentalProperties }) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <LandlordShell
        active='overview'
        completedAction=''
        listingPublicationEmptyState='Assigned listings will appear here.'
        managerListings={[]}
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
          title: 'Overview',
          summary: 'Your properties records and actions.',
          nav: ['Overview', 'Properties'],
          statsEmptyState: 'Stats unavailable.',
          rowsEmptyState: 'Nothing needs attention yet.',
        }}
        roleActions={['Add a property']}
        session={{
          email: 'demo.landlord@test.keyforta.com',
          role: 'landlord',
          organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          getAccessToken: () => Promise.resolve('token-123'),
        }}
        showListingPublication
        showPropertyManagement
      />
    </FluentProvider>,
  );
}

describe('"Set pricing & availability" checklist row opens the sole unit\'s Manage-this-unit control (§10.2)', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('opens the existing "Manage this unit" toggle when exactly one property with exactly one unit exists', async () => {
    const { container } = renderShell({ rentalProperties: soleProperty });
    const anchor = container.querySelector('#kf-property-management-anchor');
    anchor.scrollIntoView = vi.fn();

    // Unlock the reused (protected) panel's live commands so its "Set
    // pricing & availability" toggle button is actually enabled/clickable
    // — the same precondition test/property-management.test.jsx uses.
    // Both reused panels render their own "Sign in to continue" button, so
    // this is scoped to the property-management anchor specifically.
    within(anchor).getByRole('button', { name: 'Sign in to continue' }).click();
    await within(anchor).findByRole('button', { name: 'Set pricing & availability' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await within(anchor).findByRole('button', { name: 'Set pricing & availability' })).toBeEnabled();

    // Sanity check: the toggle starts closed (only its own "Set pricing &
    // availability" button visible, not the pricing/availability forms).
    expect(screen.queryByRole('heading', { name: 'Pricing & availability' })).not.toBeInTheDocument();

    const checklist = screen.getByTestId('next-best-action-checklist');
    const setPricingRow = within(checklist).getByText('Set pricing & availability').closest('button');
    setPricingRow.click();

    expect(anchor.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    // The reused, protected UnitPricingAvailabilityForm's own localized
    // heading only renders once its internal `open` state is true — this
    // proves the toggle button was actually clicked, not merely scrolled to.
    expect(await screen.findByRole('heading', { name: 'Pricing & availability' })).toBeInTheDocument();
  });

  it('does not attempt to open any unit toggle when more than one property/unit exists (still just scrolls)', async () => {
    const twoProperties = [...soleProperty, { ...soleProperty[0], id: 'second-property-id', name: 'Second Property' }];
    const { container } = renderShell({ rentalProperties: twoProperties });
    const anchor = container.querySelector('#kf-property-management-anchor');
    anchor.scrollIntoView = vi.fn();

    within(anchor).getByRole('button', { name: 'Sign in to continue' }).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const checklist = screen.getByTestId('next-best-action-checklist');
    const setPricingRow = within(checklist).getByText('Set pricing & availability').closest('button');
    setPricingRow.click();

    expect(anchor.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(screen.queryByRole('heading', { name: 'Pricing & availability' })).not.toBeInTheDocument();
  });
});
