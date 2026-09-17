import { useEffect, useState } from 'react';
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
  return useRequest(() => listPublicProperties(query), [queryKey]);
}

export function usePublicProperty(propertyId) {
  return useRequest(() => getPublicProperty(propertyId), [propertyId]);
}