import { proxyPublicApi } from '../../../proxy.js';

// REQ-038/PROP-031: metadata (not bytes) for a published listing's
// scan-gated, room-grouped photo gallery.
export async function GET(request, { params }) {
  const { listingId } = await params;
  return proxyPublicApi(request, `public-listings/${encodeURIComponent(listingId)}/photos`);
}
