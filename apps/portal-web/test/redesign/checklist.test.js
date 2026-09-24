import { describe, expect, it } from 'vitest';
import { computeNextBestActionChecklist } from '../../src/redesign/landlord/checklist.js';

// Spec: docs/product/LANDLORD_REDESIGN_SPEC.md §10.2. Every row must be
// derived ONLY from data already present in the `properties`/`listings`
// arrays already fetched by `useRentalProperties`/`useManagerListings` (no
// new fetch). The "set pricing & availability" row must render as
// 'unknown' (never fabricated) because the current
// `rentalPropertyProjectionSchema` unit shape exposes no pricing/rent
// field — see §10.2 item 2 and §10.6(m).
describe('computeNextBestActionChecklist (spec §10.2)', () => {
  it('marks every row as not-done/unknown for a brand-new landlord with no data', () => {
    const rows = computeNextBestActionChecklist({ properties: [], listings: [] });
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row.status]));
    expect(byKey).toEqual({
      addProperty: 'todo',
      setPricing: 'unknown',
      addPhotos: 'todo',
      publishListing: 'todo',
    });
  });

  it('marks addProperty done once at least one property exists', () => {
    const rows = computeNextBestActionChecklist({
      properties: [{ id: 'p1', units: [] }],
      listings: [],
    });
    expect(rows.find((row) => row.key === 'addProperty').status).toBe('done');
  });

  it('marks setPricing unknown regardless of input, since no existing field can compute it', () => {
    const rows = computeNextBestActionChecklist({
      properties: [{ id: 'p1', units: [{ id: 'u1', availabilityStatus: 'available' }] }],
      listings: [],
    });
    expect(rows.find((row) => row.key === 'setPricing').status).toBe('unknown');
  });

  it('marks addPhotos done once any listing has at least one imageUrl', () => {
    const rows = computeNextBestActionChecklist({
      properties: [],
      listings: [{ id: 'l1', imageUrls: [], status: 'draft' }, { id: 'l2', imageUrls: ['https://x/1.jpg'], status: 'draft' }],
    });
    expect(rows.find((row) => row.key === 'addPhotos').status).toBe('done');
  });

  // Copilot PR #134 review finding #4: `imageUrls` on the already-fetched
  // listing feed is only the legacy URL list — uploaded KEYFORTA-hosted
  // images come from a separate `/public-listings/:listingId/images`
  // fetch that ListingImageManager only runs once opened, so an empty
  // `imageUrls` array on a listing that already exists does NOT reliably
  // mean "no photos"; it may just mean "photos exist via the newer path
  // and this already-fetched feed can't see them". Only "no listings
  // exist at all" can be confidently called 'todo' — anything else with
  // no visible imageUrls must be honestly 'unknown', matching the same
  // "never fabricate an answer the data can't support" rule already
  // applied to `setPricing` (§10.2 item 2, §10.6(m)).
  it('marks addPhotos unknown (not todo) when a listing exists but its imageUrls are empty, since photos may exist via the separate image-upload endpoint', () => {
    const rows = computeNextBestActionChecklist({
      properties: [],
      listings: [{ id: 'l1', imageUrls: [], status: 'draft' }],
    });
    expect(rows.find((row) => row.key === 'addPhotos').status).toBe('unknown');
  });

  it('marks addPhotos todo when there are no listings at all (nothing to have photos on)', () => {
    const rows = computeNextBestActionChecklist({ properties: [], listings: [] });
    expect(rows.find((row) => row.key === 'addPhotos').status).toBe('todo');
  });

  it('marks publishListing done once any listing has status "published"', () => {
    const rows = computeNextBestActionChecklist({
      properties: [],
      listings: [{ id: 'l1', imageUrls: [], status: 'withdrawn' }, { id: 'l2', imageUrls: [], status: 'published' }],
    });
    expect(rows.find((row) => row.key === 'publishListing').status).toBe('done');
  });

  it('is resilient to null/undefined properties or listings (still returns all four rows)', () => {
    const rows = computeNextBestActionChecklist({ properties: null, listings: undefined });
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.key)).toEqual(['addProperty', 'setPricing', 'addPhotos', 'publishListing']);
  });

  it('computes an overall "anyPublished" summary flag used to choose the card title copy', () => {
    const before = computeNextBestActionChecklist({ properties: [], listings: [] });
    const after = computeNextBestActionChecklist({ properties: [], listings: [{ id: 'l1', imageUrls: [], status: 'published' }] });
    expect(before.some((row) => row.key === 'publishListing' && row.status === 'done')).toBe(false);
    expect(after.some((row) => row.key === 'publishListing' && row.status === 'done')).toBe(true);
  });
});
