import { proxyPublicApi } from '../../proxy.js';

export async function GET(request, { params }) {
  const { propertyId } = await params;
  return proxyPublicApi(request, `properties/${encodeURIComponent(propertyId)}`);
}