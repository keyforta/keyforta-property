import { useEffect, useRef, useState } from 'react';
import { getPublicProperty, listPublicProperties } from '../services/public-properties.js';

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