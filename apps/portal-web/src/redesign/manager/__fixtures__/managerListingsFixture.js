// Dev-only, additive-only fixture for deterministic Manager redesign
// tests (unit + e2e). Shape mirrors `publicListingSummarySchema`
// (packages/contracts/src/index.js) field-for-field, matching the exact
// shape `useManagerListings` supplies in production — this file only
// supplies it directly (no fetch, no new endpoint, no auth) so a mixed
// set of listing statuses can be rendered deterministically.
export const managerListingsFixture = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    imageUrls: [],
    mediaReviewNotes: null,
    mediaReviewStatus: 'approved',
    note: 'Gombe, Kinshasa',
    status: 'published',
    summary: null,
    title: 'Avenue Kalemie Residence — Unit 3B',
    unitId: '11111111-1111-4111-8111-111111111111',
    version: 2,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    imageUrls: [],
    mediaReviewNotes: null,
    mediaReviewStatus: 'pending',
    note: 'Ngaliema, Kinshasa',
    status: 'draft',
    summary: null,
    title: 'Boulevard du 30 Juin — Unit 2A',
    unitId: '66666666-6666-4666-8666-666666666666',
    version: 1,
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    imageUrls: [],
    mediaReviewNotes: null,
    mediaReviewStatus: 'approved',
    note: 'Lingwala, Kinshasa',
    status: 'withdrawn',
    summary: null,
    title: 'Avenue de la Paix — Unit 1C',
    unitId: '88888888-8888-4888-8888-888888888888',
    version: 3,
  },
];
