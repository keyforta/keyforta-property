import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Copilot review finding: the public-web app had no `/api/v1/public-listings`
// proxy route(s) at all, so in the default same-origin deployment (no
// NEXT_PUBLIC_API_BASE_URL configured) the gallery fetch 404s at the Next.js
// layer before ever reaching Fastify, and uploaded photos never render.
describe('public-listings photo gallery proxy routes (REQ-038/PROP-031)', () => {
  const previousBaseUrl = process.env.KEYFORTA_API_BASE_URL;

  beforeEach(() => {
    process.env.KEYFORTA_API_BASE_URL = 'https://api.example.test/api/v1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousBaseUrl === undefined) delete process.env.KEYFORTA_API_BASE_URL;
    else process.env.KEYFORTA_API_BASE_URL = previousBaseUrl;
  });

  it('proxies GET /api/v1/public-listings/:listingId/photos to the upstream API', async () => {
    const { GET } = await import('../app/api/v1/public-listings/[listingId]/photos/route.js');
    const fetchMock = vi.fn(async (url) => {
      expect(url.toString()).toBe('https://api.example.test/api/v1/public-listings/listing-1/photos');
      return new Response(JSON.stringify({ data: { allPhotos: [], rooms: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = { nextUrl: { search: '' }, headers: new Headers() };
    const response = await GET(request, { params: Promise.resolve({ listingId: 'listing-1' }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { allPhotos: [], rooms: [] } });
  });

  it('proxies GET /api/v1/public-listings/:listingId/images/:imageId/content with a raised size cap and no forced JSON accept/content-type', async () => {
    const { GET } = await import(
      '../app/api/v1/public-listings/[listingId]/images/[imageId]/content/route.js'
    );
    const imageBytes = new Uint8Array(2 * 1024 * 1024).fill(1); // 2 MB, above the default 1 MB JSON cap.
    const fetchMock = vi.fn(async (url, init) => {
      expect(url.toString()).toBe(
        'https://api.example.test/api/v1/public-listings/listing-1/images/image-1/content',
      );
      expect(init.headers.accept).toBe('image/jpeg, image/png');
      return new Response(imageBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = { nextUrl: { search: '' }, headers: new Headers() };
    const response = await GET(request, {
      params: Promise.resolve({ listingId: 'listing-1', imageId: 'image-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toHaveLength(imageBytes.length);
  });
});
