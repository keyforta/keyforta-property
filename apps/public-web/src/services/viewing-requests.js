import { publicViewingRequestInputSchema } from '@keyforta/contracts';

// Public, anonymous route (see docs/openapi.yaml `requestViewing`); no access token required.
export async function submitViewingRequest(input) {
  const body = publicViewingRequestInputSchema.parse(input);
  const response = await fetch('/api/v1/viewing-requests', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'The viewing request could not be submitted.');
    error.code = payload?.error?.code;
    throw error;
  }
  return payload.data;
}
