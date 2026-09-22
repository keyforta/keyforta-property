import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@keyforta/ui', () => ({
  AppBrand: ({ surface }) => <div>{surface} brand</div>,
  MetricCard: ({ label, value, note }) => <div><strong>{label}</strong><span>{value}</span><small>{note}</small></div>,
}));

const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const createApiClientOptions = vi.hoisted(() => []);
const createApiClientMock = vi.hoisted(() => vi.fn((options) => {
  createApiClientOptions.push(options);
  return { create, update };
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
    createApiClientMock.mockClear();
    createApiClientOptions.length = 0;
    i18n.changeLanguage('en');
  });

  it('renders the existing property/unit portfolio', () => {
    renderPanel();
    expect(screen.getByText('Riverside Apartments')).toBeInTheDocument();
    expect(screen.getByText('Unit 2A')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
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

  describe('public listing creation and draft editing (REQ-037)', () => {
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
      fireEvent.change(screen.getByLabelText('Image URLs*'), { target: { value: 'https://images.test/a.jpg' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /I confirm that I own each linked image/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));

      await waitFor(() => expect(create).toHaveBeenCalledWith(
        `units/${properties[0].units[0].id}/public-listing`,
        expect.objectContaining({
          title: 'Riverside apartment — Unit 2A',
          summary: 'A bright two-bedroom unit close to transit.',
          imageUrls: ['https://images.test/a.jpg'],
          attestationAccepted: true,
        }),
      ));
      expect(await screen.findByText('Public listing created successfully.')).toBeInTheDocument();
      expect(onRetryListingsFeed).toHaveBeenCalledTimes(1);
    });

    it('requires at least one image URL before creating a public listing', async () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Create public listing' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Create public listing' }));

      fireEvent.change(screen.getByLabelText('Listing title*'), { target: { value: 'Riverside apartment — Unit 2A' } });
      fireEvent.change(screen.getByLabelText('Listing summary*'), { target: { value: 'A bright two-bedroom unit close to transit.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));

      expect(await screen.findByText('Provide at least one image URL, one per line.')).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it('requires the image-rights attestation to be checked before creating a public listing (REQ-037/PROP-025)', async () => {
      renderPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Create public listing' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Create public listing' }));

      fireEvent.change(screen.getByLabelText('Listing title*'), { target: { value: 'Riverside apartment — Unit 2A' } });
      fireEvent.change(screen.getByLabelText('Listing summary*'), { target: { value: 'A bright two-bedroom unit close to transit.' } });
      fireEvent.change(screen.getByLabelText('Image URLs*'), { target: { value: 'https://images.test/a.jpg' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create listing' }));

      expect(await screen.findByText('You must confirm the image-rights attestation before creating a listing.')).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });


    it('shows a draft listing status with an edit affordance instead of a create form', async () => {
      const draftListing = {
        id: '22222222-2222-4222-8222-222222222222',
        imageUrls: ['https://images.test/a.jpg'],
        mediaReviewNotes: null,
        mediaReviewStatus: 'pending',
        note: '',
        status: 'draft',
        summary: 'A bright two-bedroom unit close to transit.',
        title: 'Riverside apartment — Unit 2A',
        unitId: properties[0].units[0].id,
        version: 1,
      };
      renderPanel({ listings: [draftListing] });

      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Awaiting media review')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit draft listing' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create public listing' })).not.toBeInTheDocument();
    });

    it('edits a draft listing, sending the expected version for optimistic concurrency', async () => {
      const draftListing = {
        id: '22222222-2222-4222-8222-222222222222',
        imageUrls: ['https://images.test/a.jpg'],
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
      renderPanel({ listings: [publishedListing] });

      expect(screen.getByText('Published')).toBeInTheDocument();
      expect(screen.getByText('Media approved')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit draft listing' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create public listing' })).not.toBeInTheDocument();
    });
  });
});


