import { useEffect, useState } from 'react';
import { createApiClient } from '@keyforta/api-client';
import { publicListingListEnvelopeSchema } from '@keyforta/contracts';
import { resolveApiBaseUrl } from '../listing-publication-panel.jsx';

// Resolves the signed-in manager/landlord's authoritative public-listing
// portfolio from the server (GET /api/v1/public-listings/mine), replacing
// the manual listing-ID entry point that previously required the manager to
// already know a listing's id (issue #114). Demo sessions and sessions
// without an organization context or access-token getter never call the
// live API and simply resolve to an empty portfolio. Callers must surface
// `error`/`loading` explicitly (not just `listings`): a fetch failure still
// resolves `listings` to `[]`, which would otherwise be indistinguishable
// from a manager who genuinely has no assigned listings yet.
export function useManagerListings(session) {
  const [state, setState] = useState({ loading: false, listings: [], error: null });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (
      session?.sessionMode === 'demo'
      || !session?.organizationId
      || !session?.getAccessToken
    ) {
      setState({ loading: false, listings: [], error: null });
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
        const payload = await apiClient.get('public-listings', 'mine');
        const parsed = publicListingListEnvelopeSchema.parse(payload);
        if (active) setState({ loading: false, listings: parsed.items, error: null });
      } catch (error) {
        if (active) setState({ loading: false, listings: [], error });
      }
    })();
    return () => {
      active = false;
    };
  }, [session, retryCount]);

  return { ...state, retry: () => setRetryCount((count) => count + 1) };
}
