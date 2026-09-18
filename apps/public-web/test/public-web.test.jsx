import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/hooks/use-public-properties.js', () => ({
  usePublicProperties: vi.fn(),
  usePublicProperty: vi.fn(),
}));

import { usePublicProperties, usePublicProperty } from '../src/hooks/use-public-properties.js';
import '../src/i18n.js';
import { HomePage, PropertiesPage, ViewingRequestPage } from '../src/views/index.js';

function renderWithProviders(node) {
  return render(<FluentProvider theme={webLightTheme}><MemoryRouter>{node}</MemoryRouter></FluentProvider>);
}

const property = {
  id: 'property-1',
  name: 'Riverside apartment',
  city: 'Kinshasa',
  district: 'Gombe',
  bedrooms: 2,
  bathrooms: 1,
  monthlyRentMinor: '40000',
  currency: 'USD',
  availableFrom: '2026-10-01',
  imageUrls: ['/test.jpg'],
  amenities: ['Water'],
  summary: 'Synthetic summary.',
};

describe('public-web components', () => {
  beforeEach(() => {
    usePublicProperties.mockReset();
    usePublicProperty.mockReset();
  });

  it('renders home page loading cards while featured properties load', () => {
    usePublicProperties.mockReturnValue({ data: null, error: null, loading: true, retry: vi.fn() });
    renderWithProviders(<HomePage lang='en' onSearch={vi.fn()} voiceText='' voiceStatus='' voiceVoices={[]} voiceChoice='' onVoiceChoice={vi.fn()} onVoiceText={vi.fn()} onVoicePlay={vi.fn()} onVoiceStop={vi.fn()} onOpenAccess={vi.fn()} />);
    expect(screen.getByText('Loading published properties...')).toBeInTheDocument();
  });

  it('renders the empty properties state when no listings match filters', () => {
    usePublicProperties.mockReturnValue({ data: { items: [], total: 0 }, error: null, loading: false, loadingMore: false, loadMore: vi.fn(), retry: vi.fn() });
    renderWithProviders(<PropertiesPage lang='en' filters={{ area: '', beds: '', max: '', sort: 'recommended' }} onFilterChange={vi.fn()} />);
    expect(screen.getByText(/No properties match these filters\./i)).toBeInTheDocument();
  });

  it('renders the error state when listings fail to load', () => {
    usePublicProperties.mockReturnValue({ data: null, error: new Error('boom'), loading: false, loadingMore: false, loadMore: vi.fn(), retry: vi.fn() });
    renderWithProviders(<PropertiesPage lang='en' filters={{ area: '', beds: '', max: '', sort: 'recommended' }} onFilterChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Properties could not be loaded/i);
  });

  it('renders the not-found boundary when a viewing target is unavailable', () => {
    usePublicProperty.mockReturnValue({ data: null, error: null, loading: false, retry: vi.fn() });
    renderWithProviders(<ViewingRequestPage lang='en' propertyId='missing-property' onSubmit={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Property not found/i })).toBeInTheDocument();
  });

  it('renders the error boundary when the viewing page cannot load property details', () => {
    usePublicProperty.mockReturnValue({ data: null, error: new Error('forbidden'), loading: false, retry: vi.fn() });
    renderWithProviders(<ViewingRequestPage lang='en' propertyId='property-1' onSubmit={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Properties could not be loaded/i);
  });

  it('has no critical accessibility violations for the home page', async () => {
    usePublicProperties.mockReturnValue({ data: { items: [property], total: 1 }, error: null, loading: false, retry: vi.fn() });
    const { container } = renderWithProviders(<HomePage lang='en' onSearch={vi.fn()} voiceText='' voiceStatus='' voiceVoices={[]} voiceChoice='' onVoiceChoice={vi.fn()} onVoiceText={vi.fn()} onVoicePlay={vi.fn()} onVoiceStop={vi.fn()} onOpenAccess={vi.fn()} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
