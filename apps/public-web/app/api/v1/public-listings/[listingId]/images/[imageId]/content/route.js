import { proxyPublicApi } from '../../../../../proxy.js';

// REQ-038/PROP-031: raw image bytes for a single uploaded photo (scan-gated,
// served only while the underlying listing is publicly eligible). Images
// can be up to 10 MB (matching the upload cap), far above the default 1 MB
// JSON response cap, and must not force a JSON accept header or fall back
// to a JSON content-type.
const maxImageResponseBytes = 10 * 1024 * 1024;

export async function GET(request, { params }) {
  const { listingId, imageId } = await params;
  return proxyPublicApi(
    request,
    `public-listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(imageId)}/content`,
    { headers: { accept: 'image/jpeg, image/png' } },
    { defaultContentType: 'application/octet-stream', maxResponseBytes: maxImageResponseBytes },
  );
}
