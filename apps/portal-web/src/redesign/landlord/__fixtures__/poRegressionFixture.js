// Dev-only, additive-only fixture for reproducing the exact PO-reported
// combination without any database/API access: a unit that is
// `availabilityStatus: 'available'` (unit occupancy) whose public listing
// is `status: 'withdrawn'` (listing publication) with
// `mediaReviewStatus: 'approved'`. Both fields are genuinely independent
// and can legitimately disagree — the PO read the pairing as a
// contradiction only because the §10.4/§11 visual chunking placed the two
// unrelated badges next to each other with no distinguishing caption (see
// redesign.css's "Regression fix" comment block).
//
// Shapes mirror `rentalPropertyProjectionSchema`/`publicListingSummarySchema`
// (packages/contracts/src/index.js) field-for-field so this fixture can
// never silently drift from the real contract — LandlordShell/
// PropertyManagementPanel/ListingPublicationPanel receive exactly this
// shape from the real `useRentalProperties`/`useManagerListings` hooks in
// production; this file only supplies it directly (no fetch, no new
// endpoint, no auth) so the exact combination can be rendered and
// screenshotted deterministically for visual QA.
const UNIT_ID = '11111111-1111-4111-8111-111111111111';

export const poRegressionRentalProperties = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Avenue Kalemie Residence',
    propertyType: 'apartment_building',
    address: {
      avenueOrStreet: 'Avenue Kalemie',
      number: '12',
      quartier: 'Gombe',
      commune: 'Gombe',
      city: 'Kinshasa',
      province: 'Kinshasa',
      countryCode: 'CD',
    },
    timeZone: 'Africa/Kinshasa',
    jurisdictionCode: null,
    verificationStatus: 'verified',
    publicationStatus: 'pending_review',
    version: 1,
    archivedAt: null,
    units: [
      {
        id: UNIT_ID,
        label: 'Unit 3B',
        unitType: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        areaSquareMeters: null,
        floorLabel: '3',
        furnishingStatus: 'unfurnished',
        // Unit occupancy availability: genuinely 'available' right now.
        availabilityStatus: 'available',
        publicationStatus: 'published',
        version: 3,
        archivedAt: null,
      },
    ],
  },
];

export const poRegressionManagerListings = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    imageUrls: [],
    mediaReviewNotes: null,
    // Media review already approved (photos are fine) — but publication
    // itself was withdrawn (e.g. the landlord paused it), an unrelated
    // decision from the unit's own occupancy availability above.
    mediaReviewStatus: 'approved',
    note: 'Gombe, Kinshasa',
    // Listing publication status: genuinely 'withdrawn' at the same time
    // the unit is 'available' — both true, not a contradiction.
    status: 'withdrawn',
    summary: null,
    title: 'Avenue Kalemie Residence — Unit 3B',
    unitId: UNIT_ID,
    version: 2,
  },
];
