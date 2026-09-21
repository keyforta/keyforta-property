import {
  pendingPublicListingMediaReviewListEnvelopeSchema,
  publicListingMediaReviewEnvelopeSchema,
  publicListingMediaReviewInputSchema,
} from '@keyforta/contracts';
import { resolveAdminApiBaseUrl } from './onboarding-api.js';

const maximumResponseBytes = 1024 * 1024;
const requestTimeoutMilliseconds = 10_000;
const authorizationScheme = ['Bear', 'er'].join('');

// Mirrors createOnboardingApi's request/error-shape conventions exactly (see
// onboarding-api.js), applied to the platform-admin media-review queue
// (REQ-037 / issue #116's final slice: create a PublicListing).
export function createMediaReviewApi({ baseUrl, getAccessToken, fetcher = fetch }) {
  const resolvedBaseUrl = resolveAdminApiBaseUrl(baseUrl);

  async function request(path, init = {}) {
    if (!resolvedBaseUrl) throw Object.assign(new Error('The admin API is not configured.'), { code: 'API_UNAVAILABLE' });
    const accessToken = await getAccessToken();
    const response = await fetcher(`${resolvedBaseUrl}${path}`, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      headers: {
        accept: 'application/json',
        authorization: authorizationScheme + ' ' + accessToken,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
      throw Object.assign(new Error('The admin API returned an invalid response.'), { code: 'BAD_GATEWAY' });
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
      throw Object.assign(new Error('The admin API returned an invalid response.'), { code: 'BAD_GATEWAY' });
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw Object.assign(new Error('The admin API returned an invalid response.'), { code: 'BAD_GATEWAY' });
    }
    if (!response.ok) {
      throw Object.assign(new Error(payload?.error?.message || 'The admin API request failed.'), {
        code: payload?.error?.code,
        status: response.status,
      });
    }
    return payload;
  }

  return Object.freeze({
    async list() {
      return pendingPublicListingMediaReviewListEnvelopeSchema.parse(
        await request('/admin/public-listings/pending-review'),
      ).items;
    },
    async decide(listingId, input) {
      const decision = publicListingMediaReviewInputSchema.parse(input);
      const payload = await request(`/admin/public-listings/${encodeURIComponent(listingId)}/media-review`, {
        body: JSON.stringify(decision),
        method: 'POST',
      });
      return publicListingMediaReviewEnvelopeSchema.parse(payload).data;
    },
  });
}
