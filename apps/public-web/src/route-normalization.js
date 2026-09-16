const legacyRouteRoots = new Set([
  'home',
  'voice',
  'properties',
  'property',
  'view',
  'apply',
  'how',
  'landlords',
  'trust',
  'faq',
  'contact',
  'privacy',
  'terms',
  'signin',
  'login',
  'signup',
  'invite',
  'offer-services',
  'demo',
]);

export function getLegacyRouteUrl({ hash = '', search = '' }) {
  if (!hash || hash === '#') return null;

  const [routePart, fragmentPart] = hash.slice(1).split('#');
  const routePath = routePart.replace(/^\//, '');
  const [routeRoot] = routePath.split('/');

  if (routeRoot === 'status') return `/home${search}#status`;
  if (!legacyRouteRoots.has(routeRoot)) return null;

  return `/${routePath}${search}${fragmentPart ? `#${fragmentPart}` : ''}`;
}