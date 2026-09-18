import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiClient } from '../src/index.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

test('list attaches auth and organization headers', async () => {
  let captured;
  const client = createApiClient({
    baseUrl: '/api/v1',
    getToken: () => 'abc123',
    getOrganizationId: () => 'org-1',
    fetcher: async (url, options) => { captured = { url, options }; return jsonResponse({ data: [] }); },
  });

  await client.list('properties', { limit: '5', district: 'Gombe' });
  assert.equal(captured.url, '/api/v1/properties?limit=5&district=Gombe');
  assert.equal(captured.options.headers.get('authorization'), 'Bearer abc123');
  assert.equal(captured.options.headers.get('x-organization-id'), 'org-1');
  assert.equal(captured.options.headers.get('accept'), 'application/json');
});

test('create serializes JSON request bodies', async () => {
  let captured;
  const client = createApiClient({ fetcher: async (url, options) => { captured = { url, options }; return jsonResponse({ data: { id: '1' } }); } });
  await client.create('properties', { name: 'River' });
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.body, JSON.stringify({ name: 'River' }));
  assert.equal(captured.options.headers.get('content-type'), 'application/json');
});

test('returns undefined for no-content responses', async () => {
  const client = createApiClient({ fetcher: async () => ({ status: 204 }) });
  assert.equal(await client.remove('properties', 'property-1'), undefined);
});

test('throws enriched API errors for non-ok responses', async () => {
  const client = createApiClient({
    fetcher: async () => jsonResponse({ error: { message: 'Denied', code: 'FORBIDDEN', details: { reason: 'membership' }, traceId: 'trace-123' } }, { ok: false, status: 403 }),
  });
  await assert.rejects(() => client.get('properties', 'property-1'), (error) => {
    assert.equal(error.message, 'Denied');
    assert.equal(error.code, 'FORBIDDEN');
    assert.deepEqual(error.details, { reason: 'membership' });
    assert.equal(error.traceId, 'trace-123');
    return true;
  });
});
