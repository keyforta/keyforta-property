// Dev-only, additive-only fixture used to demonstrate, in a real browser,
// that clicking the "Set pricing & availability" checklist row genuinely
// opens the existing (protected, unmodified) "Manage this unit" toggle in
// `property-management-panel.jsx` — see the paired
// `ChecklistOpenPreview.jsx` and `e2e/redesign/landlord.spec.ts` (Copilot
// PR #134 review, cycle-4 finding #2/#4, comments 4099022268 and
// 4099299613).
//
// Unlike the PO-regression fixture (which intentionally uses a
// `sessionMode: 'demo'` session, since it is only demonstrating visual
// styling), this fixture's `session` is deliberately NOT a demo session:
// `property-management-panel.jsx`'s own token-resolution effect renders
// its "Manage this unit" toggle `disabled` until `tokenStatus === 'ready'`,
// which a demo session can never reach (it is pinned to `'demo'` forever
// by that panel's own, protected logic). Supplying a session shape with a
// real `organizationId` and a `getAccessTokenSilent` that resolves to a
// token exercises that panel's own already-implemented, already-approved
// "silently re-arm write access on mount" path (see commit f707fe8) — no
// new authorization logic, no bypass, no fetch: this is the same session
// contract shape `useMembership`/`portalAuth` already produce for a real
// signed-in landlord.
//
// Exactly one property with exactly one unit, matching §10.2's explicit
// "opens the control when exactly one property/unit exists" condition.
const UNIT_ID = '44444444-4444-4444-8444-444444444444';

export const checklistOpenRentalProperties = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Boulevard du 30 Juin Residence',
    propertyType: 'apartment_building',
    address: {
      avenueOrStreet: 'Boulevard du 30 Juin',
      number: '4',
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
        label: 'Unit 1A',
        unitType: 'apartment',
        bedrooms: 1,
        bathrooms: 1,
        areaSquareMeters: null,
        floorLabel: '1',
        furnishingStatus: 'unfurnished',
        availabilityStatus: 'available',
        publicationStatus: 'published',
        version: 1,
        archivedAt: null,
      },
    ],
  },
];

export const checklistOpenManagerListings = [];

export function createChecklistOpenSession() {
  return {
    email: 'demo.landlord.ready@test.keyforta.com',
    role: 'landlord',
    organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    getAccessToken: async () => 'fixture-access-token',
    // Deliberately delayed (rather than resolving on the same microtask
    // turn) to reproduce the real-world race this fixture exists to catch:
    // a genuine network round trip for silent token acquisition takes
    // measurable wall-clock time, during which the checklist row can
    // already be clicked while the real "Manage this unit" toggle is
    // still `disabled`. A same-tick resolution would make that window
    // unobservable even by a Playwright test that clicks immediately,
    // silently letting a regression back to a synchronous-only `.click()`
    // pass (see `openSoleUnitManagementControl`'s cycle-4 fix and
    // `e2e/redesign/landlord.spec.ts`'s paired end-to-end test).
    getAccessTokenSilent: () => new Promise((resolve) => {
      setTimeout(() => resolve('fixture-access-token'), 400);
    }),
  };
}
