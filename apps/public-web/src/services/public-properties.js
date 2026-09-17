import { createApiClient } from '@keyforta/api-client';

const defaultBaseUrl = '/api/v1';

export function resolveApiBaseUrl(value) {
  const candidate = value?.trim();
  if (!candidate) return defaultBaseUrl;

  if (candidate.startsWith('/')) return candidate.replace(/\/+$/, '') || defaultBaseUrl;

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

export async function listPublicProperties(query = {}) {
  const items = [];
  let cursor;
  let total = 0;

  do {
    const response = await api.list('properties', {
      limit: '100',
      ...query,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...response.items);
    total = response.total;
    cursor = response.nextCursor;
  } while (cursor);

  return { items, nextCursor: null, total };
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