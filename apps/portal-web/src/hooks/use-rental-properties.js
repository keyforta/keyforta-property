import { useEffect, useState } from 'react';
import { createApiClient } from '@keyforta/api-client';
import { rentalPropertyListEnvelopeSchema } from '@keyforta/contracts';
import { resolveApiBaseUrl } from '../listing-publication-panel.jsx';

// Resolves the signed-in landlord/manager's authoritative Property/Unit
// portfolio from the server (GET /api/v1/properties/mine), the read side of
// the Property/Unit creation gap identified in issue #116 (no portal UI
// exists to create or view properties/units, even though the backend
// commands were already approved and implemented in migration 0028). Demo
// sessions and sessions without an organization context or access-token
// getter never call the live API and simply resolve to an empty portfolio.
// Callers must surface `error`/`loading` explicitly (not just `properties`):
// a fetch failure still resolves `properties` to `[]`, which would
// otherwise be indistinguishable from an actor who genuinely has no
// properties yet.
export function useRentalProperties(session) {
  const [state, setState] = useState({ loading: false, properties: [], error: null });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (
      session?.sessionMode === 'demo'
      || !session?.organizationId
      || !session?.getAccessToken
    ) {
      setState({ loading: false, properties: [], error: null });
      return undefined;
    }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    (async () => {
      try {
        const accessToken = await session.getAccessToken();
        const apiClient = createApiClient({
          baseUrl: resolveApiBaseUrl().baseUrl,
          getOrganizationId: () => session.organizationId,
          getToken: () => accessToken,
        });
        const payload = await apiClient.get('properties', 'mine');
        const parsed = rentalPropertyListEnvelopeSchema.parse(payload);
        if (active) setState({ loading: false, properties: parsed.items, error: null });
      } catch (error) {
        if (active) setState({ loading: false, properties: [], error });
      }
    })();
    return () => {
      active = false;
    };
  }, [session, retryCount]);

  return { ...state, retry: () => setRetryCount((count) => count + 1) };
}
