import {
  pendingPublicListingMediaReviewListEnvelopeSchema,
  publicListingMediaReviewEnvelopeSchema,
  publicListingMediaReviewInputSchema,
} from '@keyforta/contracts';
import { resolveAdminApiBaseUrl } from './onboarding-api.js';

const maximumResponseBytes = 1024 * 1024;
// REQ-038: uploaded images are capped at 10 MB of decoded bytes (migration
// 0032's size_bytes check); allow a little headroom over that for the raw
// binary review-content response, which is much larger than the JSON
// envelopes maximumResponseBytes guards.
const maximumImageResponseBytes = 11 * 1024 * 1024;
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
    // Serves the raw bytes of an uploaded-but-not-yet-published image so a
    // reviewer can see it before approving; gated identically to decide()
    // (platform-admin allowlist), and only while the listing's media
    // review is still pending (fixes the REQ-038 review-visibility gap).
    // A plain <img src> cannot carry an Authorization header, so this
    // fetches the bytes directly and hands back an object URL the caller
    // must revoke (URL.revokeObjectURL) once no longer displayed.
    async getReviewImageContent(listingId, imageId) {
      if (!resolvedBaseUrl) throw Object.assign(new Error('The admin API is not configured.'), { code: 'API_UNAVAILABLE' });
      const accessToken = await getAccessToken();
      const response = await fetcher(
        `${resolvedBaseUrl}/admin/public-listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(imageId)}/content`,
        {
          cache: 'no-store',
          headers: { authorization: authorizationScheme + ' ' + accessToken },
          redirect: 'error',
          signal: AbortSignal.timeout(requestTimeoutMilliseconds),
        },
      );
      if (!response.ok) {
        throw Object.assign(new Error('The admin API request failed.'), { status: response.status });
      }
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > maximumImageResponseBytes) {
        throw Object.assign(new Error('The admin API returned an invalid response.'), { code: 'BAD_GATEWAY' });
      }
      const blob = await response.blob();
      if (blob.size > maximumImageResponseBytes) {
        throw Object.assign(new Error('The admin API returned an invalid response.'), { code: 'BAD_GATEWAY' });
      }
      return URL.createObjectURL(blob);
    },
  });
}
