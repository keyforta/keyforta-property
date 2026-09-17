import { proxyPublicApi } from '../proxy.js';

export async function POST(request) {
  const maximumBodyBytes = 16 * 1024;
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    return Response.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The viewing request is too large.' } },
      { status: 413 },
    );
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > maximumBodyBytes) {
    return Response.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The viewing request is too large.' } },
      { status: 413 },
    );
  }
  return proxyPublicApi(request, 'viewing-requests', {
    body,
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}