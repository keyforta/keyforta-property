import {
  landlordOnboardingApplicationListSchema,
  landlordOnboardingApplicationSchema,
  landlordOnboardingDecisionInputSchema,
} from '@keyforta/contracts';

const maximumResponseBytes = 1024 * 1024;
const requestTimeoutMilliseconds = 10_000;

export function resolveAdminApiBaseUrl(value) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function createOnboardingApi({ baseUrl, getAccessToken, fetcher = fetch }) {
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
        authorization: `Bearer ${accessToken}`,
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
      return landlordOnboardingApplicationListSchema.parse(
        await request('/landlord-onboarding-applications'),
      ).items;
    },
    async decide(applicationId, input) {
      const decision = landlordOnboardingDecisionInputSchema.parse(input);
      const payload = await request(`/landlord-onboarding-applications/${encodeURIComponent(applicationId)}/decision`, {
        body: JSON.stringify(decision),
        method: 'POST',
      });
      return landlordOnboardingApplicationSchema.parse(payload.data);
    },
  });
}
