import { createApiClient } from '@keyforta/api-client';

const defaultBaseUrl = '/api/v1';

export function resolveApiBaseUrl(value) {
  const candidate = value?.trim();
  if (!candidate) return defaultBaseUrl;

  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate.replace(/\/+$/, '') || defaultBaseUrl;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return defaultBaseUrl;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return defaultBaseUrl;
  }
}

const api = createApiClient({
  baseUrl: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
});

// The configured API base URL may be a different origin than the page
// serving this app (e.g. a cross-origin deployment where public-web is
// served from a CDN/static host and apps/api runs on its own domain). JSON
// responses already resolve correctly because the api-client above issues
// requests against the configured base URL, but photo `url` fields returned
// *inside* those JSON payloads are root-relative paths
// (`/api/v1/public-listings/:id/images/:imageId/content`) intended to be
// rendered directly in an `<img src>`. Those must be resolved against the
// same configured origin, or they 404 whenever the configured base URL is
// cross-origin (issue: gallery images break in cross-origin deployments).
export function resolvePublicListingPhotoUrl(url) {
  if (!url || /^https?:\/\//i.test(url)) return url;
  const configuredBaseUrl = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  try {
    return `${new URL(configuredBaseUrl).origin}${url}`;
  } catch {
    // The configured base URL is root-relative (the default, same-origin
    // case) -- no origin to prefix, the root-relative url already resolves
    // correctly against the current page's origin.
    return url;
  }
}

function resolvePhotoUrls(photo) {
  return { ...photo, url: resolvePublicListingPhotoUrl(photo.url) };
}

export async function listPublicProperties(query = {}) {
  return api.list('properties', { limit: '20', ...query });
}

export async function getPublicProperty(propertyId) {
  try {
    const response = await api.get('properties', encodeURIComponent(propertyId));
    return response.data;
  } catch (error) {
    if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') return null;
    throw error;
  }
}

// REQ-038/PROP-031: the public, scan-gated photo gallery for a published
// listing, grouped by room (plus an "All photos" view). 404 (nondisclosing:
// unpublished/ineligible listing or a listing with zero uploaded images) and
// 400 (invalid ID) both resolve to `null`, matching getPublicProperty's
// not-found handling above.
export async function getPublicListingPhotos(listingId) {
  try {
    const response = await api.get('public-listings', `${encodeURIComponent(listingId)}/photos`);
    const gallery = response.data;
    if (!gallery) return gallery;
    return {
      ...gallery,
      allPhotos: (gallery.allPhotos || []).map(resolvePhotoUrls),
      rooms: (gallery.rooms || []).map((group) => ({ ...group, photos: (group.photos || []).map(resolvePhotoUrls) })),
    };
  } catch (error) {
    if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') return null;
    throw error;
  }
}

export function formatMinorMoney(minorValue, currency, lang) {
  const minor = BigInt(minorValue);
  const whole = minor / 100n;
  const cents = minor % 100n;
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const amount = `${new Intl.NumberFormat(locale).format(whole)}${cents ? `${lang === 'fr' ? ',' : '.'}${cents.toString().padStart(2, '0')}` : ''}`;
  const currencyPart = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0)
    .find(({ type }) => type === 'currency')?.value || currency;
  return lang === 'fr' ? `${amount}\u00a0${currencyPart}` : `${currencyPart}${amount}`;
}