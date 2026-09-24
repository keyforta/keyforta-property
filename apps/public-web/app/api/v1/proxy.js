import { NextResponse } from 'next/server';

const maximumResponseBytes = 1024 * 1024;
const upstreamTimeoutMilliseconds = 10_000;

function apiBaseUrl() {
  const configured = process.env.KEYFORTA_API_BASE_URL?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    const isLoopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
      return null;
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export async function proxyPublicApi(request, path, init = {}, options = {}) {
  const maxResponseBytes = options.maxResponseBytes ?? maximumResponseBytes;
  const baseUrl = apiBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Property discovery is temporarily unavailable.' } },
      { status: 503 },
    );
  }

  const upstreamUrl = new URL(`${baseUrl}/${path}`);
  upstreamUrl.search = request.nextUrl.search;
  let response;
  try {
    response = await fetch(upstreamUrl, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(upstreamTimeoutMilliseconds),
      headers: {
        accept: 'application/json',
        ...(init.headers || {}),
        'x-request-id': request.headers.get('x-request-id') || crypto.randomUUID(),
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Property discovery is temporarily unavailable.' } },
      { status: 503 },
    );
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    return NextResponse.json(
      { error: { code: 'BAD_GATEWAY', message: 'The property service returned an invalid response.' } },
      { status: 502 },
    );
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > maxResponseBytes) {
    return NextResponse.json(
      { error: { code: 'BAD_GATEWAY', message: 'The property service returned an invalid response.' } },
      { status: 502 },
    );
  }

  return new NextResponse(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || options.defaultContentType || 'application/json; charset=utf-8',
      'x-request-id': response.headers.get('x-request-id') || '',
    },
  });
}