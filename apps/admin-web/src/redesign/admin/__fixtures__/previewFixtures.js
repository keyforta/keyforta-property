// Dev-only fixture data for the Admin redesign preview harness (paired
// with AdminPreview.jsx/preview-entry.jsx/admin-redesign-preview.html).
// Not part of the production entry point or build — see
// admin-redesign-preview.html for why. Mirrors the shape already
// exercised in test/redesign/admin-shell-axe.test.jsx and
// admin-status-tone.test.jsx so this preview renders the exact same
// computed status badges those tests already assert on, for Playwright
// screenshot capture during this phase's verification only.

export const previewAuth = {
  account: { name: 'Ada Admin', username: 'ada.admin@keyforta.test' },
  status: 'signed-in',
};

export const previewApplications = [
  {
    applicantName: 'Amina K.',
    decisionReason: '',
    id: 'app-1',
    proposedOrganizationName: 'Riverside Homes',
    status: 'pending',
    submittedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    applicantName: 'Jordan P.',
    decisionReason: 'Verified business registration and references.',
    id: 'app-2',
    proposedOrganizationName: 'Northgate Property Group',
    status: 'approved',
    submittedAt: '2026-08-24T15:30:00.000Z',
  },
  {
    applicantName: 'Sam T.',
    decisionReason: 'Unable to verify identity documents.',
    id: 'app-3',
    proposedOrganizationName: 'Sam T. Rentals',
    status: 'rejected',
    submittedAt: '2026-08-19T09:15:00.000Z',
  },
];

export const previewMediaReviews = [
  {
    imageUrls: ['https://images.keyforta.test/riverside-unit-2a-1.jpg', 'https://images.keyforta.test/riverside-unit-2a-2.jpg'],
    listingId: 'listing-1',
    organizationName: 'Riverside Homes',
    propertyName: 'Riverside Apartments',
    submittedAt: '2026-09-01T11:00:00.000Z',
    title: 'Riverside apartment — Unit 2A',
    unitLabel: 'Unit 2A',
  },
  {
    imageUrls: ['https://images.keyforta.test/northgate-unit-5-1.jpg'],
    listingId: 'listing-2',
    organizationName: 'Northgate Property Group',
    propertyName: 'Northgate Commons',
    submittedAt: '2026-08-30T09:45:00.000Z',
    title: 'Northgate Commons — Unit 5',
    unitLabel: 'Unit 5',
  },
];

// Preview-only stand-ins for the real `onboardingApi`/`mediaReviewApi`
// singletons (never re-implementing their logic — `decide()` here just
// resolves so the "Approve"/"Reject" controls are visually exercisable
// without a real backend).
export function createPreviewOnboardingApi() {
  return {
    decide: async (applicationId, { decision, reason }) => ({
      ...previewApplications.find((application) => application.id === applicationId),
      decisionReason: reason,
      status: decision,
    }),
    list: async () => previewApplications,
  };
}

export function createPreviewMediaReviewApi() {
  return {
    decide: async () => ({}),
    getReviewImageContent: async (listingId, imageId) => imageId,
    list: async () => previewMediaReviews,
  };
}
