import { proxyPublicApi } from '../proxy.js';

export function GET(request) {
  return proxyPublicApi(request, 'properties');
}