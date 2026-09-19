import { useEffect, useState } from 'react';
import { createApiClient } from '@keyforta/api-client';
import { actorMembershipListEnvelopeSchema } from '@keyforta/contracts';
import { resolveApiBaseUrl } from '../listing-publication-panel.jsx';

// Resolves the signed-in Entra identity's organization/role memberships from
// the server (GET /api/v1/session/memberships). The organization id/role is
// never trusted from the client: it is always derived here from the
// authenticated subject via the API's membership-lookup endpoint (issue #78).
export function useMembership(auth, authClient) {
  const [state, setState] = useState({ loading: false, memberships: null, error: null });

  useEffect(() => {
    if (auth.status !== 'signed-in') {
      setState({ loading: false, memberships: null, error: null });
      return undefined;
    }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    (async () => {
      try {
        const accessToken = await authClient.getAccessToken();
        const apiClient = createApiClient({
          baseUrl: resolveApiBaseUrl().baseUrl,
          getToken: () => accessToken,
        });
        const payload = await apiClient.list('session/memberships');
        const parsed = actorMembershipListEnvelopeSchema.parse(payload);
        if (active) setState({ loading: false, memberships: parsed.data, error: null });
      } catch (error) {
        if (active) setState({ loading: false, memberships: null, error });
      }
    })();
    return () => {
      active = false;
    };
  }, [auth.status, authClient]);

  return state;
}
