import { createBrowserEntraAuth } from '@keyforta/browser-auth';
import { landlordOnboardingApplicationInputSchema } from '@keyforta/contracts';

export const landlordOnboardingAuth = createBrowserEntraAuth({
  apiScope: process.env.NEXT_PUBLIC_ENTRA_API_SCOPE,
  authority: process.env.NEXT_PUBLIC_ENTRA_AUTHORITY,
  clientId: process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID,
  redirectUri: '/auth/callback',
});

export async function submitLandlordOnboardingApplication(input) {
  const body = landlordOnboardingApplicationInputSchema.parse(input);
  const accessToken = await landlordOnboardingAuth.getAccessToken();
  const response = await fetch('/api/v1/landlord-onboarding-applications', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'The onboarding application could not be submitted.');
    error.code = payload?.error?.code;
    throw error;
  }
  return payload.data;
}