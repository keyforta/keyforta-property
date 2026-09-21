import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@keyforta/ui', () => ({
  AppBrand: ({ surface }) => <div>{surface} brand</div>,
  MetricCard: ({ label, value, note }) => <div><strong>{label}</strong><span>{value}</span><small>{note}</small></div>,
}));

const create = vi.hoisted(() => vi.fn());
const createApiClientOptions = vi.hoisted(() => []);
const createApiClientMock = vi.hoisted(() => vi.fn((options) => {
  createApiClientOptions.push(options);
  return { create };
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

  it('surfaces an explicit feed error state with a retry affordance', () => {
    const onRetryFeed = vi.fn();
    renderPanel({ feedError: new Error('boom'), onRetryFeed });
    expect(screen.getByText(/couldn't load your properties/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryFeed).toHaveBeenCalledTimes(1);
  });

  it('has no critical accessibility violations', async () => {
    const { container } = renderPanel();
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    expect((await axe(container)).violations).toEqual([]);
  });
});
