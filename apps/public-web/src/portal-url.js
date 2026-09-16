const localPortalUrl = 'http://127.0.0.1:3001/';

export function resolvePortalWebUrl(configuredUrl, nodeEnvironment) {
  if (configuredUrl) return new URL(configuredUrl).toString();
  return nodeEnvironment === 'development' ? localPortalUrl : null;
}

export function buildPortalUrl(baseUrl, role, email) {
  if (!baseUrl) return null;

  const url = new URL(baseUrl);
  url.searchParams.set('role', role);
  if (email) url.searchParams.set('email', email);
  return url.toString();
}