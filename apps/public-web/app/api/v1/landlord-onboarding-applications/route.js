import { landlordOnboardingApplicationInputSchema } from '@keyforta/contracts';
import { proxyPublicApi } from '../proxy.js';

const maximumBodyBytes = 2 * 1024;
const maximumAuthorizationBytes = 8 * 1024;

export async function POST(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || authorization.length > maximumAuthorizationBytes) {
    return Response.json(
      { error: { code: 'UNAUTHENTICATED', message: 'A valid bearer credential is required.' } },
      { status: 401 },
    );
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    return Response.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The onboarding application is too large.' } },
      { status: 413 },
    );
  }

  const bodyBytes = await request.arrayBuffer();
  if (bodyBytes.byteLength > maximumBodyBytes) {
    return Response.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The onboarding application is too large.' } },
      { status: 413 },
    );
  }

  let parsed;
  try {
    parsed = landlordOnboardingApplicationInputSchema.safeParse(
      JSON.parse(new TextDecoder().decode(bodyBytes)),
    );
  } catch {
    parsed = { success: false };
  }
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'The onboarding application is invalid.' } },
      { status: 400 },
    );
  }

  return proxyPublicApi(request, 'landlord-onboarding-applications', {
    body: JSON.stringify(parsed.data),
    headers: {
      authorization,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}