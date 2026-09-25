import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@keyforta/ui', () => ({
  AppBrand: ({ surface }) => <div>{surface} brand</div>,
  MetricCard: ({ label, value, note }) => <div><strong>{label}</strong><span>{value}</span><small>{note}</small></div>,
}));

const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const command = vi.hoisted(() => vi.fn());
const createApiClientOptions = vi.hoisted(() => []);
const createApiClientMock = vi.hoisted(() => vi.fn((options) => {
  createApiClientOptions.push(options);
  return { create, update, list, remove, command };
}));
vi.mock('@keyforta/api-client', () => ({
  createApiClient: createApiClientMock,
}));

import { PropertyManagementPanel } from '../src/property-management-panel.jsx';
import i18n from '../src/i18n.js';

const properties = [
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

const baseSession = {
  email: 'landlord@example.com',
  role: 'landlord',
  issuedAt: '2026-09-18T00:00:00.000Z',
  getAccessToken: () => Promise.resolve('token-123'),
  organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
};

function renderPanel(props = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <PropertyManagementPanel session={baseSession} properties={properties} {...props} />
    </FluentProvider>,
  );
}

function fillCreatePropertyForm() {
  fireEvent.change(screen.getByLabelText('Property name*'), { target: { value: 'Garden Residence' } });
  fireEvent.change(screen.getByLabelText('Avenue or street*'), { target: { value: 'Avenue de la Paix' } });
  fireEvent.change(screen.getByLabelText('Number*'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Quartier*'), { target: { value: 'Gombe' } });
  fireEvent.change(screen.getByLabelText('Commune*'), { target: { value: 'Gombe' } });
  fireEvent.change(screen.getByLabelText('City*'), { target: { value: 'Kinshasa' } });
  fireEvent.change(screen.getByLabelText('Province*'), { target: { value: 'Kinshasa' } });
  fireEvent.change(screen.getByLabelText('Country code (ISO 3166-1 alpha-2)*'), { target: { value: 'CD' } });
  fireEvent.change(screen.getByLabelText('Time zone (IANA identifier)*'), { target: { value: 'Africa/Kinshasa' } });
  fireEvent.change(screen.getByLabelText('First unit label*'), { target: { value: 'Unit 1' } });
}

describe('PropertyManagementPanel', () => {
  beforeEach(() => {
    create.mockReset();
    update.mockReset();
    list.mockReset();
    remove.mockReset();
    command.mockReset();
    list.mockResolvedValue({ items: [], meta: { requestId: 'req-images-default' } });
    createApiClientMock.mockClear();
    createApiClientOptions.length = 0;
    i18n.changeLanguage('en');
  });

  it('renders the existing property/unit portfolio', () => {
    const { container } = renderPanel();
    expect(screen.getByText('Riverside Apartments')).toBeInTheDocument();
    expect(screen.getByText('Unit 2A')).toBeInTheDocument();
    // Scoped to the unit's own Status badge — 'Available' is now also a
    // filter-dropdown <option> elsewhere in this panel, so an unscoped
    // `getByText` would be ambiguous.
    expect(container.querySelector('.unit-row > .status:not(.listing-status)').textContent).toBe('Available');
  });

  it('shows an honest empty state when the landlord has no properties yet', () => {
    renderPanel({ properties: [] });
    expect(screen.getByText(/You have not created any properties yet/i)).toBeInTheDocument();
  });

  it('creates a new property with its first unit once the actor signs in', async () => {
    create.mockResolvedValueOnce({
      data: { propertyId: 'c2d7f9c1-3a4b-4c5d-9e0f-1a2b3c4d5e6f', propertyVersion: 1, unitId: 'd3e8fac2-4b5c-4d6e-8f0a-2b3c4d5e6f70', unitVersion: 1 },
      meta: { requestId: 'req-1' },
    });
    const onRetryFeed = vi.fn();
    renderPanel({ onRetryFeed });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create property' })).toBeEnabled());

    fillCreatePropertyForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create property' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith('properties', expect.objectContaining({
      name: 'Garden Residence',
      propertyType: 'apartment_building',
      timeZone: 'Africa/Kinshasa',
      address: expect.objectContaining({ countryCode: 'CD', city: 'Kinshasa' }),
      firstUnit: expect.objectContaining({ label: 'Unit 1', unitType: 'studio' }),
    })));
    expect(await screen.findByText('Property created successfully.')).toBeInTheDocument();
    expect(onRetryFeed).toHaveBeenCalledTimes(1);
  });

  it('adds a unit to an existing property once the actor signs in', async () => {
    create.mockResolvedValueOnce({
      data: { unitId: 'd3e8fac2-4b5c-4d6e-8f0a-2b3c4d5e6f70', unitVersion: 1 },
      meta: { requestId: 'req-2' },
    });
    const onRetryFeed = vi.fn();
    renderPanel({ onRetryFeed });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a unit' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Add a unit' }));
    fireEvent.change(screen.getByLabelText('Unit label*'), { target: { value: 'Unit 3C' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create unit' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(
      `properties/${properties[0].id}/units`,
      expect.objectContaining({ label: 'Unit 3C', unitType: 'studio' }),
    ));
    expect(await screen.findByText('Unit created successfully.')).toBeInTheDocument();
    expect(onRetryFeed).toHaveBeenCalledTimes(1);
  });

  it('surfaces a create-property failure without losing the entered form data', async () => {
    create.mockRejectedValue(new Error('Property creation service unavailable.'));
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create property' })).toBeEnabled());
    fillCreatePropertyForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create property' }));

    expect(await screen.findByText('Property creation service unavailable.')).toBeInTheDocument();
    expect(screen.getByLabelText('Property name*')).toHaveValue('Garden Residence');
  });

  it('disables property/unit creation for demo sessions', () => {
    renderPanel({ session: { ...baseSession, sessionMode: 'demo', getAccessToken: undefined } });
    expect(screen.getByText(/Demo portal sessions cannot create or manage properties/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create property' })).toBeDisabled();
  });

  it('disables property/unit creation when organization context is missing', () => {
    renderPanel({ session: { ...baseSession, organizationId: null } });
    expect(screen.getByText(/Property management is unavailable until an organization context is selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create property' })).toBeDisabled();
  });

  it('silently re-arms write access on mount when getAccessTokenSilent resolves a token, without a manual click (issue #123)', async () => {
    const getAccessTokenSilent = vi.fn().mockResolvedValue('silent-token');
    renderPanel({ session: { ...baseSession, getAccessTokenSilent } });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create property' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Sign in to continue' })).not.toBeInTheDocument();
    expect(getAccessTokenSilent).toHaveBeenCalledTimes(1);
  });

  it('keeps the manual sign-in affordance when getAccessTokenSilent resolves without a token', async () => {
    const getAccessTokenSilent = vi.fn().mockResolvedValue(null);
    renderPanel({ session: { ...baseSession, getAccessTokenSilent } });

    await waitFor(() => expect(getAccessTokenSilent).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create property' })).toBeDisabled();
  });

  it('keeps the manual sign-in affordance when getAccessTokenSilent rejects', async () => {
    const getAccessTokenSilent = vi.fn().mockRejectedValue(new Error('Interaction required.'));
    renderPanel({ session: { ...baseSession, getAccessTokenSilent } });

    await waitFor(() => expect(getAccessTokenSilent).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create property' })).toBeDisabled();
  });

  it('surfaces an explicit feed error state with a retry affordance', () => {
    const onRetryFeed = vi.fn();
    renderPanel({ feedError: new Error('boom'), onRetryFeed });
    expect(screen.getByText(/couldn't load your properties/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryFeed).toHaveBeenCalledTimes(1);
  });

  it('sets pricing for an existing unit once the actor signs in (issue #116)', async () => {
    update.mockResolvedValueOnce({
      data: { pricingVersionId: 'f1a2b3c4-5d6e-4f70-8a1b-2c3d4e5f6a71', unitVersion: 2 },
      meta: { requestId: 'req-3' },
    });
    const onRetryFeed = vi.fn();
    renderPanel({ onRetryFeed });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    fireEvent.change(screen.getByLabelText('Monthly rent amount*'), { target: { value: '400.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(
      `units/${properties[0].units[0].id}`,
      'pricing',
      expect.objectContaining({ amountMinor: 40050, currency: 'CDF', expectedVersion: 1 }),
    ));
    expect(await screen.findByText('Pricing updated successfully.')).toBeInTheDocument();
    expect(onRetryFeed).toHaveBeenCalledTimes(1);
  });

  it('requires a reason code before marking a unit unavailable (issue #116)', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    fireEvent.change(screen.getByLabelText('Availability status'), { target: { value: 'unavailable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update availability' }));

    expect(await screen.findByText('A reason is required when marking a unit unavailable.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('sets availability for an existing unit once the actor signs in (issue #116)', async () => {
    update.mockResolvedValueOnce({
      data: { availabilityVersionId: 'a9b8c7d6-5e4f-4a3b-9c2d-1e0f9a8b7c65', unitVersion: 2 },
      meta: { requestId: 'req-4' },
    });
    const onRetryFeed = vi.fn();
    renderPanel({ onRetryFeed });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    fireEvent.change(screen.getByLabelText('Availability status'), { target: { value: 'unavailable' } });
    fireEvent.change(screen.getByLabelText('Reason*'), { target: { value: 'Undergoing renovation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update availability' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(
      `units/${properties[0].units[0].id}`,
      'availability',
      expect.objectContaining({ status: 'unavailable', reasonCode: 'Undergoing renovation', expectedVersion: 1 }),
    ));
    expect(await screen.findByText('Availability updated successfully.')).toBeInTheDocument();
    expect(onRetryFeed).toHaveBeenCalledTimes(1);
  });

  it('initializes the availability selector from the unit\'s current status (issue #116)', async () => {
    const unavailableProperties = [{
      ...properties[0],
      units: [{ ...properties[0].units[0], availabilityStatus: 'unavailable' }],
    }];
    renderPanel({ properties: unavailableProperties });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    expect(screen.getByLabelText('Availability status')).toHaveValue('unavailable');
  });

  it('shows a validation message and does not submit an invalid pricing amount (issue #116)', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    fireEvent.change(screen.getByLabelText('Monthly rent amount*'), { target: { value: '400.999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing' }));

    expect(await screen.findByText(/Enter a whole or decimal amount/i)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('preserves the submitted availability status after a successful save (issue #116)', async () => {
    update.mockResolvedValueOnce({
      data: { availabilityVersionId: 'a9b8c7d6-5e4f-4a3b-9c2d-1e0f9a8b7c65', unitVersion: 2 },
      meta: { requestId: 'req-5' },
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    fireEvent.change(screen.getByLabelText('Availability status'), { target: { value: 'unavailable' } });
    fireEvent.change(screen.getByLabelText('Reason*'), { target: { value: 'Undergoing renovation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update availability' }));

    await screen.findByText('Availability updated successfully.');
    expect(screen.getByLabelText('Availability status')).toHaveValue('unavailable');
  });

  it('uses the version returned by the first mutation for a second command in the same session (issue #116)', async () => {
    update
      .mockResolvedValueOnce({ data: { pricingVersionId: 'f1a2b3c4-5d6e-4f70-8a1b-2c3d4e5f6a71', unitVersion: 2 }, meta: { requestId: 'req-6' } })
      .mockResolvedValueOnce({ data: { availabilityVersionId: 'a9b8c7d6-5e4f-4a3b-9c2d-1e0f9a8b7c65', unitVersion: 3 }, meta: { requestId: 'req-7' } });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    fireEvent.change(screen.getByLabelText('Monthly rent amount*'), { target: { value: '400.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing' }));
    await screen.findByText('Pricing updated successfully.');

    fireEvent.change(screen.getByLabelText('Availability status'), { target: { value: 'available' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update availability' }));

    await waitFor(() => expect(update).toHaveBeenLastCalledWith(
      `units/${properties[0].units[0].id}`,
      'availability',
      expect.objectContaining({ expectedVersion: 2 }),
    ));
  });

  it('gives the pricing and availability forms distinct accessible names (issue #116)', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    expect(screen.getByRole('form', { name: 'Pricing' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Availability' })).toBeInTheDocument();
  });

  it('has no critical accessibility violations', async () => {
    const { container } = renderPanel();
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no critical accessibility violations with the pricing/availability panel expanded', async () => {
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no critical accessibility violations with a draft listing image manager rendered (REQ-038)', async () => {
    const draftListing = {
      id: '44444444-4444-4444-8444-444444444444',
      imageUrls: [],
      mediaReviewNotes: null,
      mediaReviewStatus: 'pending',
      note: '',
      status: 'draft',
      summary: 'A bright two-bedroom unit close to transit.',
      title: 'Riverside apartment — Unit 2A',
      unitId: properties[0].units[0].id,
      version: 1,
    };
    const { container } = renderPanel({ listings: [draftListing] });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Listing photos' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Listing photos' }));
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect((await axe(container)).violations).toEqual([]);
  });

  it('locks the availability command for an occupied unit instead of allowing it to be overridden (issue #116)', async () => {
    const occupiedProperties = [{
      ...properties[0],
      units: [{ ...properties[0].units[0], availabilityStatus: 'occupied' }],
    }];
    renderPanel({ properties: occupiedProperties });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    expect(screen.queryByRole('form', { name: 'Availability' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Availability status')).not.toBeInTheDocument();
    expect(screen.getByText(/occupied by an active lease/i)).toBeInTheDocument();
  });

  it('accepts a comma decimal separator matching the French validation copy (issue #116)', async () => {
    i18n.changeLanguage('fr');
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Se connecter pour continuer' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'D\u00e9finir le prix et la disponibilit\u00e9' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'D\u00e9finir le prix et la disponibilit\u00e9' }));

    fireEvent.change(screen.getByLabelText('Loyer mensuel*'), { target: { value: '400,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'D\u00e9finir le prix' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(
      `units/${properties[0].units[0].id}`,
      'pricing',
      expect.objectContaining({ amountMinor: 40050 }),
    ));
  });

  it('disables the other command while one mutation is in flight, to avoid a racing stale version (issue #116)', async () => {
    let resolvePricing;
    update.mockReturnValueOnce(new Promise((resolve) => { resolvePricing = resolve; }));
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set pricing & availability' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing & availability' }));

    fireEvent.change(screen.getByLabelText('Monthly rent amount*'), { target: { value: '400.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set pricing' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Update availability' })).toBeDisabled());

    resolvePricing({
      data: { pricingVersionId: 'f1a2b3c4-5d6e-4f70-8a1b-2c3d4e5f6a71', unitVersion: 2 },
      meta: { requestId: 'req-8' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update availability' })).toBeEnabled());
  });

  describe('public listing creation and draft editing (REQ-037/REQ-038)', () => {
    it('creates a public listing for a unit once the actor signs in', async () => {
      create.mockResolvedValueOnce({
        data: {
          listingId: '11111111-1111-4111-8111-111111111111',
          listingVersion: 1,
          unitId: properties[0].units[0].id,
          unitVersion: 2,
        },
        meta: { requestId: 'req-listing-1' },
      });
      const onRetryListingsFeed = vi.fn();
      renderPanel({ onRetryListingsFeed });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Create public listing' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Create public listing' }));

      fireEvent.change(screen.getByLabelText('Listing title*'), { target: { value: 'Riverside apartment — Unit 2A' } });
      fireEvent.change(screen.getByLabelText('Listing summary*'), { target: { value: 'A bright two-bedroom unit close to transit.' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /I confirm I own or hold the rights/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));

      await waitFor(() => expect(create).toHaveBeenCalledWith(
        `units/${properties[0].units[0].id}/public-listing`,
        expect.objectContaining({
          title: 'Riverside apartment — Unit 2A',
          summary: 'A bright two-bedroom unit close to transit.',
          attestationAccepted: true,
        }),
      ));
      // REQ-038 decision 1: the imageUrls textarea is removed; creation no
      // longer sends (or requires) any image URLs.
      expect(create.mock.calls[0][1].imageUrls).toBeUndefined();
      expect(await screen.findByText('Public listing created successfully.')).toBeInTheDocument();
      expect(onRetryListingsFeed).toHaveBeenCalledTimes(1);
    });

    it('requires the image-rights attestation to be checked before creating a public listing (REQ-037/PROP-025)', async () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Create public listing' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Create public listing' }));

      fireEvent.change(screen.getByLabelText('Listing title*'), { target: { value: 'Riverside apartment — Unit 2A' } });
      fireEvent.change(screen.getByLabelText('Listing summary*'), { target: { value: 'A bright two-bedroom unit close to transit.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));

      expect(await screen.findByText('You must confirm the image-rights attestation before creating a listing.')).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it('shows a draft listing status with an edit affordance instead of a create form', async () => {
      const draftListing = {
        id: '22222222-2222-4222-8222-222222222222',
        imageUrls: [],
        mediaReviewNotes: null,
        mediaReviewStatus: 'pending',
        note: '',
        status: 'draft',
        summary: 'A bright two-bedroom unit close to transit.',
        title: 'Riverside apartment — Unit 2A',
        unitId: properties[0].units[0].id,
        version: 1,
      };
      const { container } = renderPanel({ listings: [draftListing] });

      // Scoped to this unit's own Listing status/Media badges — both
      // 'Draft' and (post shortened-copy) 'Pending' are also filter
      // <option> text elsewhere in this panel.
      expect(container.querySelector('.unit-row > .status.listing-status').textContent).toBe('Draft');
      expect(container.querySelector('.unit-row > .media-status').textContent).toBe('Pending');
      expect(screen.getByRole('button', { name: 'Edit draft listing' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create public listing' })).not.toBeInTheDocument();
      // The image manager is now a Dialog (opened on demand), so its
      // images are fetched lazily once opened, not eagerly on mount.
      expect(screen.getByRole('button', { name: 'Listing photos' })).toBeInTheDocument();
      expect(list).not.toHaveBeenCalled();
    });

    it('edits a draft listing, sending the expected version for optimistic concurrency, and preserves its existing legacy image URLs (fixes a silent-image-wipe regression)', async () => {
      const draftListing = {
        id: '22222222-2222-4222-8222-222222222222',
        imageUrls: ['https://images.test/a.jpg', 'https://images.test/b.jpg'],
        mediaReviewNotes: null,
        mediaReviewStatus: 'pending',
        note: '',
        status: 'draft',
        summary: 'A bright two-bedroom unit close to transit.',
        title: 'Riverside apartment — Unit 2A',
        unitId: properties[0].units[0].id,
        version: 1,
      };
      update.mockResolvedValueOnce({
        data: { listingId: draftListing.id, listingVersion: 2 },
        meta: { requestId: 'req-listing-2' },
      });
      const onRetryListingsFeed = vi.fn();
      renderPanel({ listings: [draftListing], onRetryListingsFeed });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Edit draft listing' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Edit draft listing' }));

      expect(screen.getByLabelText('Listing title*')).toHaveValue('Riverside apartment — Unit 2A');
      fireEvent.change(screen.getByLabelText('Listing title*'), { target: { value: 'Riverside apartment — Unit 2A (updated)' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

      await waitFor(() => expect(update).toHaveBeenCalledWith(
        'public-listings',
        `${draftListing.id}/draft`,
        expect.objectContaining({ title: 'Riverside apartment — Unit 2A (updated)', expectedVersion: 1 }),
      ));
      // The update route's schema defaults an omitted imageUrls to [], which
      // would silently wipe a legacy listing's images on every edit; the
      // form must resend the listing's existing imageUrls unchanged.
      expect(update.mock.calls[0][2].imageUrls).toEqual(['https://images.test/a.jpg', 'https://images.test/b.jpg']);
      expect(await screen.findByText('Draft listing updated successfully.')).toBeInTheDocument();
      expect(onRetryListingsFeed).toHaveBeenCalledTimes(1);
    });

    it('shows a read-only status for a published listing instead of an editable form', () => {
      const publishedListing = {
        id: '33333333-3333-4333-8333-333333333333',
        imageUrls: ['https://images.test/a.jpg'],
        mediaReviewNotes: null,
        mediaReviewStatus: 'approved',
        note: '',
        status: 'published',
        summary: 'A bright two-bedroom unit close to transit.',
        title: 'Riverside apartment — Unit 2A',
        unitId: properties[0].units[0].id,
        version: 3,
      };
      const { container } = renderPanel({ listings: [publishedListing] });

      // Scoped for the same reason as the draft-listing test above.
      expect(container.querySelector('.unit-row > .status.listing-status').textContent).toBe('Published');
      expect(container.querySelector('.unit-row > .media-status').textContent).toBe('Approved');
      expect(screen.queryByRole('button', { name: 'Edit draft listing' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create public listing' })).not.toBeInTheDocument();
      // A published listing cannot receive/remove images (draft-only
      // invariant, migration 0032), so no image manager is rendered for it.
      expect(screen.queryByText('Listing photos')).not.toBeInTheDocument();
    });
  });

  // PO feedback ("combine Listing publication and Property portfolio in
  // the same table"): with `enableListingActions`, a published/withdrawn
  // listing's row gets an inline Publish/Withdraw action instead of the
  // legacy read-only-only rendering; without the prop (the legacy
  // portal-app.jsx consumer), behavior is unchanged.
  describe('combined listing publication actions (enableListingActions)', () => {
    const publishedListing = {
      id: '33333333-3333-4333-8333-333333333333',
      imageUrls: ['https://images.test/a.jpg'],
      mediaReviewNotes: null,
      mediaReviewStatus: 'approved',
      note: '',
      status: 'published',
      summary: 'A bright two-bedroom unit close to transit.',
      title: 'Riverside apartment — Unit 2A',
      unitId: properties[0].units[0].id,
      version: 3,
    };

    it('does not render a Publish/Withdraw action when enableListingActions is not set (legacy behavior preserved)', () => {
      renderPanel({ listings: [publishedListing] });
      expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
    });

    it('withdraws a published listing and refreshes the listings feed', async () => {
      command.mockResolvedValueOnce({
        data: { listingId: publishedListing.id, status: 'withdrawn' },
        meta: { requestId: 'req-listing-withdraw' },
      });
      const onRetryListingsFeed = vi.fn();
      renderPanel({ enableListingActions: true, listings: [publishedListing], onRetryListingsFeed });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));

      await waitFor(() => expect(command).toHaveBeenCalledWith('public-listings', publishedListing.id, 'withdraw'));
      expect(await screen.findByText('Listing withdrawn successfully.')).toBeInTheDocument();
      expect(onRetryListingsFeed).toHaveBeenCalledTimes(1);
    });

    it('publishes a withdrawn listing', async () => {
      const withdrawnListing = { ...publishedListing, status: 'withdrawn' };
      command.mockResolvedValueOnce({
        data: { listingId: withdrawnListing.id, status: 'published' },
        meta: { requestId: 'req-listing-publish' },
      });
      renderPanel({ enableListingActions: true, listings: [withdrawnListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

      await waitFor(() => expect(command).toHaveBeenCalledWith('public-listings', withdrawnListing.id, 'publish'));
      expect(await screen.findByText('Listing published successfully.')).toBeInTheDocument();
    });

    it('surfaces the listings-feed loading/error state distinctly from the properties feed when enableListingActions is set', () => {
      renderPanel({ enableListingActions: true, listingsFeedError: true, listings: [] });
      expect(screen.getByText('We couldn\'t load your assigned listings. This does not mean you have no listings — try again.')).toBeInTheDocument();
    });

    // REQ-039: the Product Owner reported "I have withdrawn unit but I
    // can't add new images to them" — migrations 0034/0035 already widen
    // the backend guard to accept `withdrawn` alongside `draft`, so the
    // portal UI must keep rendering the image manager's trigger for a
    // withdrawn listing (unlike a published one, which stays fully
    // read-only). The image manager itself is now a Dialog (like every
    // other form in this panel), so opening it is required before its
    // fields become visible.
    it('still renders the image manager for a withdrawn listing (REQ-039), unlike a published listing', async () => {
      const withdrawnListing = { ...publishedListing, status: 'withdrawn' };
      renderPanel({ enableListingActions: true, listings: [withdrawnListing] });
      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Listing photos' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Listing photos' }));
      expect(await screen.findByText('Listing photos')).toBeInTheDocument();
      await waitFor(() => expect(list).toHaveBeenCalledWith(`public-listings/${withdrawnListing.id}/images`));
    });

    it('does not render the image manager for a published listing', () => {
      renderPanel({ enableListingActions: true, listings: [publishedListing] });
      expect(screen.queryByRole('button', { name: 'Listing photos' })).not.toBeInTheDocument();
    });
  });

  describe('listing image upload (REQ-038)', () => {
    const draftListing = {
      id: '22222222-2222-4222-8222-222222222222',
      imageUrls: [],
      mediaReviewNotes: null,
      mediaReviewStatus: 'pending',
      note: '',
      status: 'draft',
      summary: 'A bright two-bedroom unit close to transit.',
      title: 'Riverside apartment — Unit 2A',
      unitId: properties[0].units[0].id,
      version: 1,
    };

    function jpegFile(name = 'kitchen.jpg', content = 'abc') {
      return new File([content], name, { type: 'image/jpeg' });
    }

    it('uploads an image with a room tag and the accepted attestation', async () => {
      create.mockResolvedValueOnce({
        data: { imageId: 'aaaaaaaa-1111-4111-8111-111111111111', listingId: draftListing.id, listingVersion: 2, position: 0 },
        meta: { requestId: 'req-image-1' },
      });
      renderPanel({ listings: [draftListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      await waitFor(() => expect(list).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Room*'), { target: { value: 'kitchen' } });
      fireEvent.change(screen.getByLabelText('Photo file*'), { target: { files: [jpegFile()] } });
      fireEvent.click(screen.getByRole('checkbox', { name: /I confirm I own or hold the rights to display this image/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

      await waitFor(() => expect(create).toHaveBeenCalledWith(
        `public-listings/${draftListing.id}/images`,
        { room: 'kitchen', mediaType: 'image/jpeg', contentBase64: 'YWJj', attestationAccepted: true },
      ));
      // After a successful upload the image list is refetched to reflect it.
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
      // The attestation checkbox resets after a successful upload, matching
      // the existing room/file-input reset convention on this form.
      expect(screen.getByRole('checkbox', { name: /I confirm I own or hold the rights to display this image/ })).not.toBeChecked();
    });

    it('rejects submitting an upload with no room selected', async () => {
      renderPanel({ listings: [draftListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      await waitFor(() => expect(list).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Photo file*'), { target: { files: [jpegFile()] } });
      fireEvent.click(screen.getByRole('checkbox', { name: /I confirm I own or hold the rights to display this image/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

      expect(await screen.findByText('Choose a room before uploading.')).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it('disables the upload submit button until the image-rights attestation is checked', async () => {
      renderPanel({ listings: [draftListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      await waitFor(() => expect(list).toHaveBeenCalled());

      expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Room*'), { target: { value: 'kitchen' } });
      fireEvent.change(screen.getByLabelText('Photo file*'), { target: { files: [jpegFile()] } });
      expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();

      fireEvent.click(screen.getByRole('checkbox', { name: /I confirm I own or hold the rights to display this image/ }));
      expect(screen.getByRole('button', { name: 'Upload photo' })).not.toBeDisabled();

      expect(create).not.toHaveBeenCalled();
    });

    it('rejects submitting an upload without checking the image-rights attestation', async () => {
      renderPanel({ listings: [draftListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      await waitFor(() => expect(list).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Room*'), { target: { value: 'kitchen' } });
      fireEvent.change(screen.getByLabelText('Photo file*'), { target: { files: [jpegFile()] } });
      // The submit button is disabled until attestation is checked, so use
      // the form's submit event directly to prove the guard also holds if
      // the disabled state is ever bypassed (e.g. programmatic submit).
      fireEvent.submit(screen.getByRole('button', { name: 'Upload photo' }).closest('form'));

      expect(await screen.findByText(
        'You must confirm the image-rights attestation before uploading this photo.',
      )).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects an oversized file before calling the API', async () => {
      renderPanel({ listings: [draftListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      await waitFor(() => expect(list).toHaveBeenCalled());

      const oversized = new File([new Uint8Array(11 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
      fireEvent.change(screen.getByLabelText('Room*'), { target: { value: 'kitchen' } });
      fireEvent.change(screen.getByLabelText('Photo file*'), { target: { files: [oversized] } });
      fireEvent.click(screen.getByRole('checkbox', { name: /I confirm I own or hold the rights to display this image/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

      expect(await screen.findByText('Images must be 10 MB or smaller.')).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a non-JPEG/PNG file before calling the API', async () => {
      renderPanel({ listings: [draftListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      await waitFor(() => expect(list).toHaveBeenCalled());

      const invalid = new File(['abc'], 'photo.gif', { type: 'image/gif' });
      fireEvent.change(screen.getByLabelText('Room*'), { target: { value: 'kitchen' } });
      fireEvent.change(screen.getByLabelText('Photo file*'), { target: { files: [invalid] } });
      fireEvent.click(screen.getByRole('checkbox', { name: /I confirm I own or hold the rights to display this image/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

      expect(await screen.findByText('Only JPEG or PNG images can be uploaded.')).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it('deletes an uploaded image and refreshes the list', async () => {
      list.mockReset();
      list
        .mockResolvedValueOnce({
          items: [{ imageId: 'bbbbbbbb-2222-4222-8222-222222222222', room: 'kitchen', mediaType: 'image/jpeg', sizeBytes: 3, position: 0, createdAt: '2026-09-22T00:00:00.000Z' }],
          meta: { requestId: 'req-image-list-1' },
        })
        .mockResolvedValueOnce({ items: [], meta: { requestId: 'req-image-list-2' } });
      remove.mockResolvedValueOnce({
        data: { listingId: draftListing.id, listingVersion: 2 },
        meta: { requestId: 'req-image-delete-1' },
      });
      renderPanel({ listings: [draftListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(remove).toHaveBeenCalledWith(
        `public-listings/${draftListing.id}/images`,
        'bbbbbbbb-2222-4222-8222-222222222222',
      ));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument());
      expect(await screen.findByText('No photos uploaded yet.')).toBeInTheDocument();
    });

    it('disables uploads once the listing has 10 images (REQ-037 cap)', async () => {
      list.mockReset();
      const items = Array.from({ length: 10 }, (_, index) => ({
        imageId: `cccccccc-0000-4000-8000-00000000000${index}`,
        room: 'other',
        mediaType: 'image/jpeg',
        sizeBytes: 3,
        position: index,
        createdAt: '2026-09-22T00:00:00.000Z',
      }));
      list.mockResolvedValue({ items, meta: { requestId: 'req-image-cap' } });
      renderPanel({ listings: [draftListing] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled());
      expect(screen.getByText('This listing already has the maximum of 10 photos allowed.')).toBeInTheDocument();
    });

    // REQ-038's 10-image cap is combined across legacy imageUrls and
    // uploaded images (both render in the same public gallery), so a
    // listing with pre-existing legacy URLs must count them toward the cap
    // instead of only counting uploaded rows.
    it('disables uploads once legacy imageUrls plus uploaded images reach the combined cap of 10', async () => {
      list.mockReset();
      const items = Array.from({ length: 8 }, (_, index) => ({
        imageId: `dddddddd-0000-4000-8000-00000000000${index}`,
        room: 'other',
        mediaType: 'image/jpeg',
        sizeBytes: 3,
        position: index,
        createdAt: '2026-09-22T00:00:00.000Z',
      }));
      list.mockResolvedValue({ items, meta: { requestId: 'req-image-legacy-cap' } });
      const listingWithLegacyUrls = {
        ...draftListing,
        imageUrls: ['https://images.test/a.jpg', 'https://images.test/b.jpg'],
      };
      renderPanel({ listings: [listingWithLegacyUrls] });

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Listing photos' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled());
      expect(screen.getByText('This listing already has the maximum of 10 photos allowed.')).toBeInTheDocument();
    });
  });
});


