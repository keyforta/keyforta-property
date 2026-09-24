import { useEffect, useRef, useState } from 'react';
import { getPublicListingPhotos, getPublicProperty, listPublicProperties } from '../services/public-properties.js';

function useRequest(load, dependencies) {
  const [state, setState] = useState({ data: null, error: null, loading: true, retryKey: 0 });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, error: null, loading: true }));
    load()
      .then((data) => active && setState((current) => ({ ...current, data, error: null, loading: false })))
      .catch((error) => active && setState((current) => ({ ...current, data: null, error, loading: false })));
    return () => { active = false; };
  }, [...dependencies, state.retryKey]);

  return {
    ...state,
    retry: () => setState((current) => ({ ...current, retryKey: current.retryKey + 1 })),
  };
}

export function usePublicProperties(query = {}) {
  const queryKey = JSON.stringify(query);
  const requestVersion = useRef(0);
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: true,
    loadingMore: false,
    retryKey: 0,
  });

  useEffect(() => {
    const version = ++requestVersion.current;
    setState((current) => ({ ...current, data: null, error: null, loading: true }));
    listPublicProperties(query)
      .then((data) => version === requestVersion.current &&
        setState((current) => ({ ...current, data, error: null, loading: false })))
      .catch((error) => version === requestVersion.current &&
        setState((current) => ({ ...current, data: null, error, loading: false })));
  }, [queryKey, state.retryKey]);

  const loadMore = async () => {
    const cursor = state.data?.nextCursor;
    if (!cursor || state.loadingMore) return;
    const version = requestVersion.current;
    setState((current) => ({ ...current, error: null, loadingMore: true }));
    try {
      const page = await listPublicProperties({ ...query, cursor });
      if (version !== requestVersion.current) return;
      setState((current) => ({
        ...current,
        data: {
          ...page,
          items: [...(current.data?.items || []), ...page.items],
        },
        loadingMore: false,
      }));
    } catch (error) {
      if (version === requestVersion.current) {
        setState((current) => ({ ...current, error, loadingMore: false }));
      }
    }
  };

  return {
    ...state,
    loadMore,
    retry: () => setState((current) => ({ ...current, retryKey: current.retryKey + 1 })),
  };
}

export function usePublicProperty(propertyId) {
  return useRequest(() => getPublicProperty(propertyId), [propertyId]);
}

// PROP-031: the public listing photo gallery (REQ-038), grouped by room tab
// plus an "All photos" view. `listingId` is the PublicListing's own UUID
// (distinct from `property.id`, the public-facing slug used by
// usePublicProperty; see apps/api/src/properties/postgres-gateway.ts). A
// listing with no uploaded images yet (legacy imageUrls-only listings, or a
// listing not yet eligible/published) resolves to `null` data so callers can
// fall back to the legacy single-image display.
export function usePublicListingPhotos(listingId) {
  return useRequest(() => (listingId ? getPublicListingPhotos(listingId) : Promise.resolve(null)), [listingId]);
}