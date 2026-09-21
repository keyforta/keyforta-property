import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublicListingInputSchema,
  pendingPublicListingMediaReviewSchema,
  publicListingMediaReviewInputSchema,
  publicListingSummarySchema,
  updatePublicListingDraftInputSchema,
} from "../src/index.js";

const validImageUrl = "https://cdn.keyforta.test/listing-1/photo-1.jpg";

test("REQ-037 createPublicListingInputSchema requires https-only image URLs", () => {
  const base = {
    idempotencyKey: "create-listing-1",
    imageUrls: [validImageUrl],
    summary: "A bright two-bedroom unit close to transit and shops.",
    title: "Riverside apartment — Unit 2A",
  };

  assert.equal(createPublicListingInputSchema.safeParse(base).success, true);
  assert.equal(
    createPublicListingInputSchema.safeParse({
      ...base,
      imageUrls: ["http://cdn.keyforta.test/listing-1/photo-1.jpg"],
    }).success,
    false,
  );
});

test("REQ-037 updatePublicListingDraftInputSchema requires https-only image URLs", () => {
  const base = {
    expectedVersion: 1,
    imageUrls: [validImageUrl],
    summary: "A bright two-bedroom unit close to transit and shops.",
    title: "Riverside apartment — Unit 2A",
  };

  assert.equal(updatePublicListingDraftInputSchema.safeParse(base).success, true);
  assert.equal(
    updatePublicListingDraftInputSchema.safeParse({
      ...base,
      imageUrls: ["http://cdn.keyforta.test/listing-1/photo-1.jpg"],
    }).success,
    false,
  );
});

test("REQ-037 publicListingSummarySchema and pendingPublicListingMediaReviewSchema reject http image URLs", () => {
  const summary = {
    id: "9f6c6f2e-6c7a-4b5b-8b3a-1f2e3d4c5b6a",
    imageUrls: [validImageUrl],
    mediaReviewNotes: null,
    mediaReviewStatus: "pending",
    note: "Gombe, Kinshasa",
    status: "draft",
    summary: "A bright two-bedroom unit close to transit and shops.",
    title: "Riverside apartment — Unit 2A",
    unitId: "1a2b3c4d-5e6f-4789-9abc-def012345678",
    version: 1,
  };
  assert.equal(publicListingSummarySchema.safeParse(summary).success, true);
  assert.equal(
    publicListingSummarySchema.safeParse({
      ...summary,
      imageUrls: ["http://cdn.keyforta.test/listing-1/photo-1.jpg"],
    }).success,
    false,
  );

  const pendingReview = {
    imageUrls: [validImageUrl],
    listingId: "9f6c6f2e-6c7a-4b5b-8b3a-1f2e3d4c5b6a",
    organizationId: "2b3c4d5e-6f70-4890-9abc-def012345678",
    organizationName: "Riverside Homes",
    propertyName: "Riverside Apartments",
    submittedAt: "2026-09-01T10:00:00.000Z",
    summary: "A bright two-bedroom unit close to transit.",
    title: "Riverside apartment — Unit 2A",
    unitId: "1a2b3c4d-5e6f-4789-9abc-def012345678",
    unitLabel: "Unit 2A",
  };
  assert.equal(pendingPublicListingMediaReviewSchema.safeParse(pendingReview).success, true);
  assert.equal(
    pendingPublicListingMediaReviewSchema.safeParse({
      ...pendingReview,
      imageUrls: ["http://cdn.keyforta.test/listing-1/photo-1.jpg"],
    }).success,
    false,
  );
});

test("REQ-037 createPublicListingInputSchema and updatePublicListingDraftInputSchema require the same title/summary bounds as the database validator (3-140, 10-4000)", () => {
  const createBase = {
    idempotencyKey: "create-listing-1",
    imageUrls: [validImageUrl],
    summary: "A bright two-bedroom unit close to transit and shops.",
    title: "Riverside apartment — Unit 2A",
  };
  assert.equal(
    createPublicListingInputSchema.safeParse({ ...createBase, title: "AB" }).success,
    false,
  );
  assert.equal(
    createPublicListingInputSchema.safeParse({ ...createBase, title: "ABC" }).success,
    true,
  );
  assert.equal(
    createPublicListingInputSchema.safeParse({ ...createBase, summary: "123456789" }).success,
    false,
  );
  assert.equal(
    createPublicListingInputSchema.safeParse({ ...createBase, summary: "1234567890" }).success,
    true,
  );

  const updateBase = {
    expectedVersion: 1,
    imageUrls: [validImageUrl],
    summary: "A bright two-bedroom unit close to transit and shops.",
    title: "Riverside apartment — Unit 2A",
  };
  assert.equal(
    updatePublicListingDraftInputSchema.safeParse({ ...updateBase, title: "AB" }).success,
    false,
  );
  assert.equal(
    updatePublicListingDraftInputSchema.safeParse({ ...updateBase, summary: "123456789" })
      .success,
    false,
  );
});

test("REQ-037 publicListingMediaReviewInputSchema requires reviewer notes to reject", () => {
  assert.equal(
    publicListingMediaReviewInputSchema.safeParse({ decision: "approved" }).success,
    true,
  );
  assert.equal(
    publicListingMediaReviewInputSchema.safeParse({ decision: "rejected" }).success,
    false,
  );
  assert.equal(
    publicListingMediaReviewInputSchema.safeParse({
      decision: "rejected",
      notes: "Photos are too dark to evaluate.",
    }).success,
    true,
  );
});
