import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/hooks/use-public-properties.js', () => ({
  usePublicProperty: vi.fn(),
  usePublicListingPhotos: vi.fn(),
}));

import { usePublicListingPhotos, usePublicProperty } from '../src/hooks/use-public-properties.js';
import '../src/i18n.js';
import { PropertyDetailPage } from '../src/views/index.js';

function renderWithProviders(node) {
  return render(<FluentProvider theme={webLightTheme}><MemoryRouter>{node}</MemoryRouter></FluentProvider>);
}

const property = {
  id: 'listing-1',
  // The public-facing `id` above is a slug (e.g. would be
  // "riverside-apartment" in production); `listingId` is the distinct
  // PublicListing uuid that the photos route actually requires.
  listingId: '00000000-0000-4000-8000-000000000901',
  name: 'Riverside apartment',
  city: 'Kinshasa',
  district: 'Gombe',
  bedrooms: 2,
  bathrooms: 1,
  monthlyRentMinor: '40000',
  currency: 'USD',
  availableFrom: '2026-10-01',
  imageUrls: ['/legacy.jpg'],
  amenities: ['Water'],
  summary: 'Synthetic summary.',
};

// REQ-038/PROP-031: the public listing detail page's photo gallery groups
// uploaded images by room tab (plus an "All photos" view), fetched from
// GET /api/v1/public-listings/:listingId/photos via usePublicListingPhotos.
describe('PropertyDetailPage photo gallery (REQ-038)', () => {
  beforeEach(() => {
    usePublicProperty.mockReset();
    usePublicListingPhotos.mockReset();
    usePublicProperty.mockReturnValue({ data: property, error: null, loading: false, retry: vi.fn() });
  });

  it('renders an "All photos" tab and one tab per room that has at least one photo', () => {
    usePublicListingPhotos.mockReturnValue({
      data: {
        allPhotos: [
          { imageId: 'a1', room: 'kitchen', url: '/api/v1/public-listings/listing-1/images/a1/content' },
          { imageId: 'a2', room: 'bedroom', url: '/api/v1/public-listings/listing-1/images/a2/content' },
        ],
        rooms: [
          { room: 'kitchen', photos: [{ imageId: 'a1', room: 'kitchen', url: '/api/v1/public-listings/listing-1/images/a1/content' }] },
          { room: 'bedroom', photos: [{ imageId: 'a2', room: 'bedroom', url: '/api/v1/public-listings/listing-1/images/a2/content' }] },
        ],
      },
      error: null,
      loading: false,
      retry: vi.fn(),
    });

    renderWithProviders(<PropertyDetailPage lang='en' propertyId='listing-1' />);

    expect(screen.getByRole('tab', { name: 'All photos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Kitchen' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Bedroom' })).toBeInTheDocument();
    // A room with zero photos (e.g. Bathroom) is never returned by the API
    // and no tab should be rendered for it -- no client-side filtering
    // needed here since the server already omits it.
    expect(screen.queryByRole('tab', { name: 'Bathroom' })).not.toBeInTheDocument();
    // Initially the "All photos" view is selected and shows every photo.
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('switches to a room tab and shows only that room\'s photos', () => {
    usePublicListingPhotos.mockReturnValue({
      data: {
        allPhotos: [
          { imageId: 'a1', room: 'kitchen', url: '/content/a1' },
          { imageId: 'a2', room: 'bedroom', url: '/content/a2' },
        ],
        rooms: [
          { room: 'kitchen', photos: [{ imageId: 'a1', room: 'kitchen', url: '/content/a1' }] },
          { room: 'bedroom', photos: [{ imageId: 'a2', room: 'bedroom', url: '/content/a2' }] },
        ],
      },
      error: null,
      loading: false,
      retry: vi.fn(),
    });

    renderWithProviders(<PropertyDetailPage lang='en' propertyId='listing-1' />);
    fireEvent.click(screen.getByRole('tab', { name: 'Kitchen' }));

    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/content/a1');
  });

  it('falls back to the legacy single-image display when no uploaded gallery is available', () => {
    usePublicListingPhotos.mockReturnValue({ data: null, error: null, loading: false, retry: vi.fn() });

    renderWithProviders(<PropertyDetailPage lang='en' propertyId='listing-1' />);

    expect(screen.queryByRole('tab', { name: 'All photos' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Photo of Riverside apartment/ })).toHaveAttribute('src', '/legacy.jpg');
  });

  it('has no critical accessibility violations with a multi-room gallery rendered', async () => {
    usePublicListingPhotos.mockReturnValue({
      data: {
        allPhotos: [{ imageId: 'a1', room: 'kitchen', url: '/content/a1' }],
        rooms: [{ room: 'kitchen', photos: [{ imageId: 'a1', room: 'kitchen', url: '/content/a1' }] }],
      },
      error: null,
      loading: false,
      retry: vi.fn(),
    });

    const { container } = renderWithProviders(<PropertyDetailPage lang='en' propertyId='listing-1' />);
    expect((await axe(container)).violations).toEqual([]);
  });

  // The photos route (`GET /api/v1/public-listings/:listingId/photos`)
  // requires the PublicListing's uuid, not the public-facing `id` slug;
  // passing the slug returns 400 and the gallery silently never renders.
  it("fetches the photo gallery using the listing's uuid, not its public-facing slug", () => {
    usePublicListingPhotos.mockReturnValue({ data: null, error: null, loading: false, retry: vi.fn() });

    renderWithProviders(<PropertyDetailPage lang='en' propertyId='listing-1' />);

    expect(usePublicListingPhotos).toHaveBeenCalledWith(property.listingId);
  });
});
