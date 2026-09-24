// Next-best-action checklist logic (docs/product/LANDLORD_REDESIGN_SPEC.md
// §10.2). Pure, presentation-agnostic, and computed strictly from data the
// app already fetches (the same `properties`/`listings` arrays already
// passed into `PropertyManagementPanel`/`ListingPublicationPanel` today via
// `useRentalProperties`/`useManagerListings`). No new fetch, no new API
// call, no fabricated aggregate/percentage.
//
// `setPricing` is intentionally always 'unknown': the current
// `rentalPropertyProjectionSchema` unit shape (packages/contracts) exposes
// `availabilityStatus`/`publicationStatus` but no pricing/rent field, so
// "has this unit's pricing been set?" cannot be answered from data already
// on hand without a new/changed query (§10.2 item 2, §10.6(m)). Rendering
// an honest "status unknown" row is the spec's explicit requirement rather
// than guessing from a loosely-related field.
//
// `addPhotos` (Copilot PR #134 review finding #4): the already-fetched
// listing feed's `imageUrls` is only the legacy URL list. Uploaded
// KEYFORTA-hosted images come from a separate
// `/public-listings/:listingId/images` fetch that ListingImageManager only
// makes once its own UI is opened — that data is NOT part of this
// checklist's inputs, so an empty `imageUrls` array on a listing that
// already exists does not reliably mean "no photos", only "this
// already-fetched feed can't see any". Only the case where there are no
// listings at all can be confidently called 'todo'; anything else must be
// honestly 'unknown' rather than fabricated, matching the same rule
// already applied to `setPricing`.
export function computeNextBestActionChecklist({ properties, listings } = {}) {
  const safeProperties = Array.isArray(properties) ? properties : [];
  const safeListings = Array.isArray(listings) ? listings : [];

  const hasProperty = safeProperties.length > 0;
  const hasListingPhotos = safeListings.some((listing) => Array.isArray(listing?.imageUrls) && listing.imageUrls.length > 0);
  const hasPublishedListing = safeListings.some((listing) => listing?.status === 'published');

  let addPhotosStatus;
  if (hasListingPhotos) {
    addPhotosStatus = 'done';
  } else if (safeListings.length === 0) {
    addPhotosStatus = 'todo';
  } else {
    addPhotosStatus = 'unknown';
  }

  return [
    { key: 'addProperty', status: hasProperty ? 'done' : 'todo' },
    { key: 'setPricing', status: 'unknown' },
    { key: 'addPhotos', status: addPhotosStatus },
    { key: 'publishListing', status: hasPublishedListing ? 'done' : 'todo' },
  ];
}
