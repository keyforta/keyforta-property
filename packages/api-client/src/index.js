export const createApiClient = ({ baseUrl = '/api/v1', fetcher = fetch, getToken = () => null, getOrganizationId = () => null } = {}) => {
  const request = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('accept', 'application/json');
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const token = getToken();
    const organizationId = getOrganizationId();
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (organizationId) headers.set('x-organization-id', organizationId);
    const response = await fetcher(`${baseUrl}${path}`, { ...options, headers });
    if (response.status === 204) return undefined;
    const payload = await response.json();
    if (!response.ok) { const error = new Error(payload?.error?.message || 'KEYFORTA API request failed'); error.code = payload?.error?.code; error.details = payload?.error?.details; error.traceId = payload?.error?.traceId; throw error; }
    return payload;
  };
  return {
    list: (resource, query = {}) => request(`/${resource}?${new URLSearchParams(query)}`),
    get: (resource, id) => request(`/${resource}/${id}`),
    create: (resource, body, options = {}) => request(`/${resource}`, { ...options, method: 'POST', body: JSON.stringify(body) }),
    update: (resource, id, body, options = {}) => request(`/${resource}/${id}`, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
    command: (resource, id, name, body = {}, options = {}) => request(`/${resource}/${id}/${name}`, { ...options, method: 'POST', body: JSON.stringify(body) }),
    remove: (resource, id, options = {}) => request(`/${resource}/${id}`, { ...options, method: 'DELETE' })
  };
};
