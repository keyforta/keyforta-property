import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublicListingInputSchema,
  publicListingImageRoomSchema,
  publicListingImageRooms,
  publicListingPhotoGallerySchema,
  uploadPublicListingImageInputSchema,
  uploadPublicListingImageResultSchema,
} from "../src/index.js";

// REQ-038: upload replaces URL entry as the API's input path for new/edited
// listings, so a create request may now omit imageUrls entirely (it
// defaults to an empty array) -- images are expected to be supplied
// afterward through the new upload endpoint instead.
test("REQ-038 createPublicListingInputSchema no longer requires at least one image URL", () => {
  const result = createPublicListingInputSchema.safeParse({
    attestationAccepted: true,
    idempotencyKey: "create-listing-upload-only",
    summary: "A bright two-bedroom unit close to transit and shops.",
    title: "Riverside apartment — Unit 2A",
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.imageUrls, []);
});

test("REQ-038 publicListingImageRoomSchema is the closed 7-category list", () => {
  assert.deepEqual(
    [...publicListingImageRooms].sort(),
    ["bathroom", "bedroom", "dining", "exterior", "kitchen", "living", "other"].sort(),
  );
  assert.equal(publicListingImageRoomSchema.safeParse("kitchen").success, true);
  assert.equal(publicListingImageRoomSchema.safeParse("garage").success, false);
});

test("REQ-038 uploadPublicListingImageInputSchema requires a room, a supported media type, and bounded base64 content", () => {
  const base = {
    attestationAccepted: true,
    contentBase64: Buffer.from("synthetic-jpeg-bytes").toString("base64"),
    mediaType: "image/jpeg",
    room: "kitchen",
  };
  assert.equal(uploadPublicListingImageInputSchema.safeParse(base).success, true);
  assert.equal(
    uploadPublicListingImageInputSchema.safeParse({ ...base, room: undefined }).success,
    false,
    "a room tag is required",
  );
  assert.equal(
    uploadPublicListingImageInputSchema.safeParse({ ...base, mediaType: "image/gif" }).success,
    false,
    "only JPEG/PNG are supported",
  );
  assert.equal(
    uploadPublicListingImageInputSchema.safeParse({ ...base, contentBase64: "" }).success,
    false,
    "content must not be empty",
  );
});

// PROP-028: the image-rights and consent attestation checkbox must be
// affirmatively checked before any per-image upload is accepted, mirroring
// createPublicListingInputSchema's attestationAccepted: z.literal(true).
test("PROP-028 uploadPublicListingImageInputSchema requires attestationAccepted to be exactly true", () => {
  const base = {
    contentBase64: Buffer.from("synthetic-jpeg-bytes").toString("base64"),
    mediaType: "image/jpeg",
    room: "kitchen",
  };
  assert.equal(
    uploadPublicListingImageInputSchema.safeParse(base).success,
    false,
    "attestationAccepted must be present",
  );
  assert.equal(
    uploadPublicListingImageInputSchema.safeParse({ ...base, attestationAccepted: false }).success,
    false,
    "attestationAccepted: false must be rejected",
  );
  assert.equal(
    uploadPublicListingImageInputSchema.safeParse({ ...base, attestationAccepted: "true" }).success,
    false,
    "attestationAccepted must be a boolean literal true, not a truthy string",
  );
  assert.equal(
    uploadPublicListingImageInputSchema.safeParse({ ...base, attestationAccepted: true }).success,
    true,
    "attestationAccepted: true is accepted",
  );
});

test("REQ-038 uploadPublicListingImageResultSchema shape", () => {
  const result = uploadPublicListingImageResultSchema.safeParse({
    imageId: "00000000-0000-4000-8000-000000000001",
    listingId: "00000000-0000-4000-8000-000000000002",
    listingVersion: 2,
    position: 0,
  });
  assert.equal(result.success, true);
});

// PROP-031: the public gallery groups images by room, omitting empty rooms.
test("REQ-038/PROP-031 publicListingPhotoGallerySchema groups photos by room and omits empty rooms", () => {
  const gallery = {
    allPhotos: [
      { imageId: "00000000-0000-4000-8000-000000000010", room: "kitchen", url: "/api/v1/public-listings/1/images/10/content" },
      { imageId: "00000000-0000-4000-8000-000000000011", room: "bedroom", url: "/api/v1/public-listings/1/images/11/content" },
    ],
    rooms: [
      { photos: [{ imageId: "00000000-0000-4000-8000-000000000010", room: "kitchen", url: "/api/v1/public-listings/1/images/10/content" }], room: "kitchen" },
      { photos: [{ imageId: "00000000-0000-4000-8000-000000000011", room: "bedroom", url: "/api/v1/public-listings/1/images/11/content" }], room: "bedroom" },
    ],
  };
  const result = publicListingPhotoGallerySchema.safeParse(gallery);
  assert.equal(result.success, true);
  // A room entry with zero photos must fail (photos is min(1)), matching
  // "a room tab with zero images for that listing is not shown" (PROP-031):
  // the API must omit such an entry entirely rather than emit an empty tab.
  const withEmptyRoom = {
    ...gallery,
    rooms: [...gallery.rooms, { photos: [], room: "dining" }],
  };
  assert.equal(publicListingPhotoGallerySchema.safeParse(withEmptyRoom).success, false);
});
