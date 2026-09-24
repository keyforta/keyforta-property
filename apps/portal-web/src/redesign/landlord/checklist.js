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
export function computeNextBestActionChecklist({ properties, listings } = {}) {
  const safeProperties = Array.isArray(properties) ? properties : [];
  const safeListings = Array.isArray(listings) ? listings : [];

  const hasProperty = safeProperties.length > 0;
  const hasListingPhotos = safeListings.some((listing) => Array.isArray(listing?.imageUrls) && listing.imageUrls.length > 0);
  const hasPublishedListing = safeListings.some((listing) => listing?.status === 'published');

  return [
    { key: 'addProperty', status: hasProperty ? 'done' : 'todo' },
    { key: 'setPricing', status: 'unknown' },
    { key: 'addPhotos', status: hasListingPhotos ? 'done' : 'todo' },
    { key: 'publishListing', status: hasPublishedListing ? 'done' : 'todo' },
  ];
}
