import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Issue (Medium, REQ-038 code review): apps/api returns each public photo's
// `url` as a root-relative path
// (`/api/v1/public-listings/:id/images/:imageId/content`). The public-web
// service already supports resolving JSON calls against a configured
// cross-origin API base URL (`resolveApiBaseUrl` / NEXT_PUBLIC_API_BASE_URL),
// but photo `url` fields must also be resolved against that same origin
// before being rendered in an `<img src>`, or they 404 in any cross-origin
// deployment.
describe('getPublicListingPhotos photo URL resolution (REQ-038 cross-origin fix)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalEnv;
    global.fetch = originalFetch;
    vi.resetModules();
  });

  it('resolves photo urls against the default same-origin base URL unchanged', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          allPhotos: [{ imageId: 'a1', room: 'kitchen', url: '/api/v1/public-listings/listing-1/images/a1/content' }],
          rooms: [{ room: 'kitchen', photos: [{ imageId: 'a1', room: 'kitchen', url: '/api/v1/public-listings/listing-1/images/a1/content' }] }],
        },
        meta: { requestId: 'req-1' },
      }),
    });

    const { getPublicListingPhotos } = await import('../src/services/public-properties.js');
    const gallery = await getPublicListingPhotos('listing-1');

    expect(gallery.allPhotos[0].url).toBe('/api/v1/public-listings/listing-1/images/a1/content');
    expect(gallery.rooms[0].photos[0].url).toBe('/api/v1/public-listings/listing-1/images/a1/content');
  });

  it('resolves photo urls against a configured absolute, non-default, cross-origin API base URL', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example-keyforta.com/api/v1';
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          allPhotos: [{ imageId: 'a1', room: 'kitchen', url: '/api/v1/public-listings/listing-1/images/a1/content' }],
          rooms: [{ room: 'kitchen', photos: [{ imageId: 'a1', room: 'kitchen', url: '/api/v1/public-listings/listing-1/images/a1/content' }] }],
        },
        meta: { requestId: 'req-1' },
      }),
    });

    const { getPublicListingPhotos } = await import('../src/services/public-properties.js');
    const gallery = await getPublicListingPhotos('listing-1');

    expect(gallery.allPhotos[0].url).toBe(
      'https://api.example-keyforta.com/api/v1/public-listings/listing-1/images/a1/content',
    );
    expect(gallery.rooms[0].photos[0].url).toBe(
      'https://api.example-keyforta.com/api/v1/public-listings/listing-1/images/a1/content',
    );
  });

  it('leaves an already-absolute photo url untouched', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example-keyforta.com/api/v1';
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          allPhotos: [{ imageId: 'a1', room: 'kitchen', url: 'https://cdn.example.com/a1.jpg' }],
          rooms: [{ room: 'kitchen', photos: [{ imageId: 'a1', room: 'kitchen', url: 'https://cdn.example.com/a1.jpg' }] }],
        },
        meta: { requestId: 'req-1' },
      }),
    });

    const { getPublicListingPhotos } = await import('../src/services/public-properties.js');
    const gallery = await getPublicListingPhotos('listing-1');

    expect(gallery.allPhotos[0].url).toBe('https://cdn.example.com/a1.jpg');
  });
});
