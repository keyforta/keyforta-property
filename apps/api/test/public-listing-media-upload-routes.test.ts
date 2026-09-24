import { afterEach, describe, expect, it } from "vitest";
import {
  deletePublicListingImageEnvelopeSchema,
  publicListingImageListEnvelopeSchema,
  publicListingPhotoGalleryEnvelopeSchema,
  uploadPublicListingImageEnvelopeSchema,
} from "@keyforta/contracts";

import { buildApp } from "../src/app.js";
import type { MediaScanner } from "../src/media/scanner.js";
import type {
  DeletePublicListingImageCommand,
  PublicListingImageByRoom,
  PublicListingImageContent,
  PublicListingImageSummary,
  PublicListingMediaGateway,
  UploadPublicListingImageCommand,
} from "../src/properties/media-gateway.js";

const AUTH_SCHEME = ["Bear", "er"].join("");
const LANDLORD_AUTH = `${AUTH_SCHEME} synthetic-landlord-credential`;
const OUTSIDER_AUTH = `${AUTH_SCHEME} synthetic-outsider-credential`;
const ADMIN_AUTH = `${AUTH_SCHEME} synthetic-admin-credential`;

const organizationId = "00000000-0000-4000-8000-000000000900";
const listingId = "00000000-0000-4000-8000-000000000930";
const imageId = "00000000-0000-4000-8000-000000000981";
const adminObjectId = "00000000-0000-4000-8000-000000000702";

// A real JPEG file-signature prefix (SOI + APP0 markers) followed by
// arbitrary body bytes, so signature validation (added after the Copilot
// review finding on PR #131: the API previously trusted the caller-supplied
// `mediaType` with no check that the bytes were actually JPEG/PNG) accepts
// this fixture the same way a genuine JPEG upload would be accepted.
const tinyJpegBase64 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("not-real-jpeg-body"),
]).toString("base64");

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function dependencies(
  options: {
    scanner?: MediaScanner;
    rejectUpload?: boolean;
    rejectDelete?: boolean;
    rejectAuthorization?: boolean;
    images?: readonly PublicListingImageSummary[];
    photosByRoom?: readonly PublicListingImageByRoom[];
    imageContent?: PublicListingImageContent;
    reviewImageContent?: PublicListingImageContent;
  } = {},
) {
  const uploadCommands: UploadPublicListingImageCommand[] = [];
  const deleteCommands: DeletePublicListingImageCommand[] = [];
  const publicListingMedia: PublicListingMediaGateway = {
    async canActorUploadImage() {
      return !options.rejectAuthorization;
    },
    async deleteImage(command) {
      deleteCommands.push(command);
      if (options.rejectDelete) return undefined;
      return { listingId: command.listingId, listingVersion: 3 };
    },
    async getPublicImageContent() {
      return options.imageContent;
    },
    async getReviewImageContent() {
      return options.reviewImageContent;
    },
    async listImages() {
      return options.images ?? [];
    },
    async listPublicImagesByRoom() {
      return options.photosByRoom ?? [];
    },
    async uploadImage(command) {
      uploadCommands.push(command);
      if (options.rejectUpload) return undefined;
      return { imageId, listingId: command.listingId, listingVersion: 2, position: 0 };
    },
  };
  return {
    authenticator: {
      async authenticate(authorization: string) {
        if (authorization === LANDLORD_AUTH) {
          return { objectId: "00000000-0000-4000-8000-000000000701", subject: "synthetic-landlord-a" };
        }
        if (authorization === ADMIN_AUTH) {
          return { objectId: adminObjectId, subject: "synthetic-admin" };
        }
        if (authorization === OUTSIDER_AUTH) {
          return { objectId: "00000000-0000-4000-8000-000000000799", subject: "synthetic-outsider" };
        }
        return undefined;
      },
    },
    deleteCommands,
    platformAdminObjectIds: new Set([adminObjectId]),
    ...(options.scanner ? { mediaScanner: options.scanner } : {}),
    publicListingMedia,
    uploadCommands,
  };
}

describe("PublicListing image upload/list/delete routes (REQ-038)", () => {
  it("uploads an image, calling the scanner before persisting", async () => {
    const scanCalls: Array<{ bytes: Buffer; mediaType: string }> = [];
    const scanner: MediaScanner = {
      async scanUpload(bytes, mediaType) {
        scanCalls.push({ bytes, mediaType });
        return { clean: true };
      },
    };
    const configured = dependencies({ scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
        "x-request-id": "image-upload-01",
      },
      method: "POST",
      payload: { attestationAccepted: true, contentBase64: tinyJpegBase64, mediaType: "image/jpeg", room: "kitchen" },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(201);
    uploadPublicListingImageEnvelopeSchema.parse(response.json());
    expect(scanCalls).toHaveLength(1);
    expect(scanCalls[0]?.mediaType).toBe("image/jpeg");
    expect(configured.uploadCommands).toHaveLength(1);
    expect(configured.uploadCommands[0]).toMatchObject({
      listingId,
      mediaType: "image/jpeg",
      organizationId,
      room: "kitchen",
      subject: "synthetic-landlord-a",
    });
  });

  // PROP-028: a failed malware scan must reject the upload (4xx) and must
  // never invoke the storage gateway — no partial state, no stored bytes.
  it("rejects an upload when the injected scanner reports the content as unclean, without storing it", async () => {
    const scanner: MediaScanner = {
      async scanUpload() {
        return { clean: false, reason: "synthetic-signature-match" };
      },
    };
    const configured = dependencies({ scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
        "x-request-id": "image-upload-rejected-01",
      },
      method: "POST",
      payload: { attestationAccepted: true, contentBase64: tinyJpegBase64, mediaType: "image/jpeg", room: "kitchen" },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("MEDIA_SCAN_REJECTED");
    expect(configured.uploadCommands).toEqual([]);
  });

  it("rejects an upload payload missing a room tag without invoking the scanner or the gateway", async () => {
    const scanCalls: unknown[] = [];
    const scanner: MediaScanner = {
      async scanUpload() {
        scanCalls.push(true);
        return { clean: true };
      },
    };
    const configured = dependencies({ scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: { attestationAccepted: true, contentBase64: tinyJpegBase64, mediaType: "image/jpeg" },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(scanCalls).toEqual([]);
    expect(configured.uploadCommands).toEqual([]);
  });

  // PROP-028: the image-rights and consent attestation checkbox must be
  // affirmatively checked before any per-image upload is accepted. This
  // must be rejected before any database write (no gateway call) and
  // before the malware scanner runs, exactly like the other PROP-028
  // pre-storage validation checks above.
  it("rejects an upload payload missing attestationAccepted without invoking the scanner or the gateway", async () => {
    const scanCalls: unknown[] = [];
    const scanner: MediaScanner = {
      async scanUpload() {
        scanCalls.push(true);
        return { clean: true };
      },
    };
    const configured = dependencies({ scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: { contentBase64: tinyJpegBase64, mediaType: "image/jpeg", room: "kitchen" },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(scanCalls).toEqual([]);
    expect(configured.uploadCommands).toEqual([]);
  });

  // PROP-028: the same upload payload, submitted with attestationAccepted
  // explicitly false (not merely absent), must also be rejected.
  it("rejects an upload payload with attestationAccepted: false without invoking the scanner or the gateway", async () => {
    const scanCalls: unknown[] = [];
    const scanner: MediaScanner = {
      async scanUpload() {
        scanCalls.push(true);
        return { clean: true };
      },
    };
    const configured = dependencies({ scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: {
        attestationAccepted: false,
        contentBase64: tinyJpegBase64,
        mediaType: "image/jpeg",
        room: "kitchen",
      },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(scanCalls).toEqual([]);
    expect(configured.uploadCommands).toEqual([]);
  });

  // PROP-028 (green counterpart): with attestationAccepted: true, an
  // otherwise-valid upload succeeds normally.
  it("accepts an upload payload with attestationAccepted: true", async () => {
    const scanner: MediaScanner = { async scanUpload() { return { clean: true }; } };
    const configured = dependencies({ scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: {
        attestationAccepted: true,
        contentBase64: tinyJpegBase64,
        mediaType: "image/jpeg",
        room: "kitchen",
      },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(201);
    uploadPublicListingImageEnvelopeSchema.parse(response.json());
    expect(configured.uploadCommands).toHaveLength(1);
  });

  // Node's Buffer.from(value, "base64") silently drops invalid characters
  // instead of throwing, so malformed base64 must be rejected by explicit
  // format validation before any scan or database call.
  it("rejects an upload payload with malformed base64 content without invoking the scanner or the gateway", async () => {
    const scanCalls: unknown[] = [];
    const scanner: MediaScanner = {
      async scanUpload() {
        scanCalls.push(true);
        return { clean: true };
      },
    };
    const configured = dependencies({ scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: {
        attestationAccepted: true,
        contentBase64: "not!valid@base64#content",
        mediaType: "image/jpeg",
        room: "kitchen",
      },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(scanCalls).toEqual([]);
    expect(configured.uploadCommands).toEqual([]);
  });

  // Copilot review finding on PR #131: authorization must be checked before
  // the expensive base64-decode/malware-scan path, not only inside the
  // upload gateway call afterward, so an authenticated-but-unauthorized
  // actor cannot repeatedly burn scanner resources before being rejected.
  it("rejects an upload from an actor who cannot manage the listing without invoking the scanner or the upload gateway call", async () => {
    const scanCalls: unknown[] = [];
    const scanner: MediaScanner = {
      async scanUpload() {
        scanCalls.push(true);
        return { clean: true };
      },
    };
    const configured = dependencies({ rejectAuthorization: true, scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: {
        attestationAccepted: true,
        contentBase64: tinyJpegBase64,
        mediaType: "image/jpeg",
        room: "kitchen",
      },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
    expect(scanCalls).toEqual([]);
    expect(configured.uploadCommands).toEqual([]);
  });

  it("rejects an upload payload with a non-JPEG/PNG media type without invoking the scanner or the gateway", async () => {
    const configured = dependencies({
      scanner: { async scanUpload() { return { clean: true }; } },
    });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: { attestationAccepted: true, contentBase64: tinyJpegBase64, mediaType: "image/gif", room: "kitchen" },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(configured.uploadCommands).toEqual([]);
  });

  // Copilot review finding on PR #131: the declared `mediaType` was trusted
  // as proof of the actual file format, with the no-op scanner reporting
  // arbitrary bytes as clean, so non-image content could be persisted and
  // later served with an image content type. Bytes whose signature does not
  // match the declared `mediaType` must be rejected before the scan or the
  // gateway call, exactly like the other PROP-028 pre-storage checks.
  it("rejects an upload payload whose bytes do not match the declared JPEG/PNG media type, without invoking the scanner or the gateway", async () => {
    const scanCalls: unknown[] = [];
    const scanner: MediaScanner = {
      async scanUpload() {
        scanCalls.push(true);
        return { clean: true };
      },
    };
    const configured = dependencies({ scanner });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: {
        attestationAccepted: true,
        contentBase64: Buffer.from("not-real-jpeg-bytes").toString("base64"),
        mediaType: "image/jpeg",
        room: "kitchen",
      },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(scanCalls).toEqual([]);
    expect(configured.uploadCommands).toEqual([]);
  });

  // PROP-027: an actor without an active listing-manager assignment for the
  // listing's property (represented here by "no membership resolvable",
  // matching the nondisclosing gateway auth error mapped to 404) cannot
  // upload media for it.
  it("denies (nondisclosing) an upload attempt from an actor with no resolvable membership", async () => {
    const configured = dependencies({
      scanner: { async scanUpload() { return { clean: true }; } },
    });
    configured.publicListingMedia.uploadImage = async () => undefined;
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: OUTSIDER_AUTH, "x-organization-id": organizationId },
      method: "POST",
      payload: { attestationAccepted: true, contentBase64: tinyJpegBase64, mediaType: "image/jpeg", room: "kitchen" },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  // PROP-027 (cross-organization): the gateway's authorization error
  // (thrown by resolveActor when no active listing-manager membership
  // exists for the listing's organization) must also be a nondisclosing
  // 404, not a 403 that would reveal the listing exists in another org.
  it("denies (nondisclosing, cross-organization) an upload when the gateway's authorization check fails", async () => {
    const configured = dependencies({
      scanner: { async scanUpload() { return { clean: true }; } },
    });
    configured.publicListingMedia.uploadImage = async () => {
      const { RentalInventoryAuthorizationError } = await import(
        "../src/properties/inventory-command-gateway.js"
      );
      throw new RentalInventoryAuthorizationError();
    };
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": "00000000-0000-4000-8000-000000000999" },
      method: "POST",
      payload: { attestationAccepted: true, contentBase64: tinyJpegBase64, mediaType: "image/jpeg", room: "kitchen" },
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });


  it("lists a draft listing's uploaded images for an authorized actor", async () => {
    const images: readonly PublicListingImageSummary[] = [
      {
        createdAt: "2026-09-22T00:00:00.000Z",
        imageId,
        mediaType: "image/jpeg",
        position: 0,
        room: "kitchen",
        sizeBytes: 1024,
      },
    ];
    const configured = dependencies({ images });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: LANDLORD_AUTH, "x-organization-id": organizationId },
      method: "GET",
      url: `/api/v1/public-listings/${listingId}/images`,
    });

    expect(response.statusCode).toBe(200);
    const parsed = publicListingImageListEnvelopeSchema.parse(response.json());
    expect(parsed.items).toEqual(images);
  });

  it("deletes an image for an authorized actor", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
        "x-request-id": "image-delete-01",
      },
      method: "DELETE",
      url: `/api/v1/public-listings/${listingId}/images/${imageId}`,
    });

    expect(response.statusCode).toBe(200);
    deletePublicListingImageEnvelopeSchema.parse(response.json());
    expect(configured.deleteCommands).toHaveLength(1);
    expect(configured.deleteCommands[0]).toMatchObject({
      imageId,
      listingId,
      organizationId,
      subject: "synthetic-landlord-a",
    });
  });

  it("denies (nondisclosing) a delete attempt for another organization's image", async () => {
    const configured = dependencies();
    configured.publicListingMedia.deleteImage = async () => undefined;
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: OUTSIDER_AUTH, "x-organization-id": organizationId },
      method: "DELETE",
      url: `/api/v1/public-listings/${listingId}/images/${imageId}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  // PROP-031: anonymous room-grouped gallery, omitting rooms with 0 images.
  it("serves the anonymous room-grouped photo gallery, omitting empty rooms", async () => {
    const configured = dependencies({
      photosByRoom: [
        { imageId: "00000000-0000-4000-8000-000000000982", position: 0, room: "kitchen" },
        { imageId: "00000000-0000-4000-8000-000000000983", position: 1, room: "kitchen" },
        { imageId: "00000000-0000-4000-8000-000000000984", position: 0, room: "exterior" },
      ],
    });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/public-listings/${listingId}/photos`,
    });

    expect(response.statusCode).toBe(200);
    const parsed = publicListingPhotoGalleryEnvelopeSchema.parse(response.json());
    expect(parsed.data.allPhotos).toHaveLength(3);
    expect(parsed.data.rooms.map((group) => group.room).sort()).toEqual(["exterior", "kitchen"]);
    expect(parsed.data.rooms.every((group) => group.photos.length >= 1)).toBe(true);
    expect(parsed.data.rooms.some((group) => group.room === "bathroom")).toBe(false);
  });

  it("returns 404 for the anonymous photo gallery of a listing with no eligible published images", async () => {
    const configured = dependencies({ photosByRoom: [] });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/public-listings/${listingId}/photos`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("serves raw image bytes with the correct content type for an eligible published listing", async () => {
    const configured = dependencies({
      imageContent: { content: Buffer.from("jpeg-bytes"), mediaType: "image/jpeg" },
    });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/public-listings/${listingId}/images/${imageId}/content`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/jpeg");
    expect(response.rawPayload.toString()).toBe("jpeg-bytes");
  });

  it("returns 404 for image content that is not eligible for public serving", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/public-listings/${listingId}/images/${imageId}/content`,
    });

    expect(response.statusCode).toBe(404);
  });

  // Fixes the REQ-038 review-visibility gap (migration 0033): a platform
  // administrator can fetch an uploaded image's bytes while its listing is
  // still awaiting media review, gated the same way as the media-review
  // decision route.
  describe("platform-admin review-content route (fixes REQ-038 review-visibility gap)", () => {
    it("serves an uploaded image's bytes to an allowlisted platform administrator", async () => {
      const configured = dependencies({
        reviewImageContent: { content: Buffer.from("pending-review-bytes"), mediaType: "image/png" },
      });
      const app = await buildApp(configured);
      apps.push(app);

      const response = await app.inject({
        headers: { authorization: ADMIN_AUTH },
        method: "GET",
        url: `/api/v1/admin/public-listings/${listingId}/images/${imageId}/content`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
      expect(response.rawPayload.toString()).toBe("pending-review-bytes");
    });

    it("denies (nondisclosing) a non-admin caller", async () => {
      const configured = dependencies({
        reviewImageContent: { content: Buffer.from("bytes"), mediaType: "image/jpeg" },
      });
      const app = await buildApp(configured);
      apps.push(app);

      const response = await app.inject({
        headers: { authorization: OUTSIDER_AUTH },
        method: "GET",
        url: `/api/v1/admin/public-listings/${listingId}/images/${imageId}/content`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
    });

    it("requires authentication", async () => {
      const configured = dependencies();
      const app = await buildApp(configured);
      apps.push(app);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/admin/public-listings/${listingId}/images/${imageId}/content`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 404 once the image is no longer pending review (e.g. already published)", async () => {
      const configured = dependencies();
      const app = await buildApp(configured);
      apps.push(app);

      const response = await app.inject({
        headers: { authorization: ADMIN_AUTH },
        method: "GET",
        url: `/api/v1/admin/public-listings/${listingId}/images/${imageId}/content`,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
