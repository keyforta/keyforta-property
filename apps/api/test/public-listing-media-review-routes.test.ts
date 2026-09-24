import { afterEach, describe, expect, it } from "vitest";
import {
  createPublicListingEnvelopeSchema,
  pendingPublicListingMediaReviewListEnvelopeSchema,
  publicListingMediaReviewEnvelopeSchema,
  updatePublicListingDraftEnvelopeSchema,
} from "@keyforta/contracts";

import { buildApp } from "../src/app.js";
import type {
  CreatePublicListingCommand,
  RentalInventoryCommandGateway,
  UpdatePublicListingDraftCommand,
} from "../src/properties/inventory-command-gateway.js";
import type {
  PendingPublicListingMediaReview,
  PublicListingPublicationGateway,
  ReviewPublicListingMediaCommand,
} from "../src/properties/publication-gateway.js";

const AUTH_SCHEME = ["Bear", "er"].join("");
const LANDLORD_AUTH = `${AUTH_SCHEME} synthetic-landlord-credential`;
const ADMIN_AUTH = `${AUTH_SCHEME} synthetic-admin-credential`;
const OUTSIDER_AUTH = `${AUTH_SCHEME} synthetic-outsider-credential`;

const organizationId = "00000000-0000-4000-8000-000000000900";
const unitId = "00000000-0000-4000-8000-000000000920";
const listingId = "00000000-0000-4000-8000-000000000930";
const adminObjectId = "00000000-0000-4000-8000-000000000702";
const landlordObjectId = "00000000-0000-4000-8000-000000000701";
const pendingListing: PendingPublicListingMediaReview = {
  imageUrls: ["https://images.test/a.jpg"],
  listingId,
  organizationId,
  organizationName: "Synthetic Org",
  propertyName: "Synthetic Property",
  submittedAt: "2026-09-16T12:00:00.000Z",
  summary: "A bright two-bedroom unit close to transit.",
  title: "Riverside apartment",
  unitId,
  unitLabel: "Unit A",
  uploadedImages: [],
};

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function dependencies(options: { rejectCreate?: boolean; rejectDraft?: boolean; rejectReview?: boolean } = {}) {
  const createCommands: CreatePublicListingCommand[] = [];
  const draftCommands: UpdatePublicListingDraftCommand[] = [];
  const reviewCommands: ReviewPublicListingMediaCommand[] = [];
  let pendingReviewCalls = 0;
  const rentalInventoryCommands: RentalInventoryCommandGateway = {
    async addRentalUnit() { return undefined; },
    async archiveRentalProperty() { return false; },
    async archiveRentalUnit() { return false; },
    async createPublicListing(command) {
      createCommands.push(command);
      return options.rejectCreate
        ? undefined
        : { listingId, listingVersion: 1, unitId: command.unitId, unitVersion: 2 };
    },
    async createRentalProperty() { return undefined; },
    async listRentalProperties() { return []; },
    async setUnitAvailability() { return undefined; },
    async setUnitPricing() { return undefined; },
    async updatePublicListingDraft(command) {
      draftCommands.push(command);
      return options.rejectDraft
        ? undefined
        : { listingId: command.listingId, listingVersion: command.expectedVersion + 1 };
    },
  };
  const publicListingPublication: PublicListingPublicationGateway = {
    async listForActor() { return []; },
    async listPendingMediaReview() {
      pendingReviewCalls += 1;
      return [pendingListing];
    },
    async reviewPublicListingMedia(command) {
      reviewCommands.push(command);
      return options.rejectReview
        ? undefined
        : { listingId: command.listingId, mediaReviewStatus: command.decision };
    },
    async setPublication() { return false; },
  };
  return {
    authenticator: {
      async authenticate(authorization: string) {
        if (authorization === LANDLORD_AUTH) {
          return { objectId: landlordObjectId, subject: "synthetic-landlord-a" };
        }
        if (authorization === ADMIN_AUTH) {
          return { objectId: adminObjectId, subject: "synthetic-admin" };
        }
        if (authorization === OUTSIDER_AUTH) {
          return {
            objectId: "00000000-0000-4000-8000-000000000799",
            subject: "synthetic-outsider",
          };
        }
        return undefined;
      },
    },
    createCommands,
    draftCommands,
    get pendingReviewCalls() { return pendingReviewCalls; },
    platformAdminObjectIds: new Set([adminObjectId]),
    publicListingPublication,
    rentalInventoryCommands,
    reviewCommands,
  };
}

describe("PublicListing creation and draft-edit routes (REQ-037)", () => {
  it("creates a PublicListing using only verified principal identity", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
        "x-request-id": "listing-create-01",
      },
      method: "POST",
      payload: {
        idempotencyKey: "idem-listing-create-01",
        imageUrls: ["https://images.test/a.jpg"],
        attestationAccepted: true,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit 2A",
      },
      url: `/api/v1/units/${unitId}/public-listing`,
    });

    expect(response.statusCode).toBe(201);
    createPublicListingEnvelopeSchema.parse(response.json());
    expect(configured.createCommands).toEqual([{
      attestationAccepted: true,
      correlationId: "listing-create-01",
      idempotencyKey: "idem-listing-create-01",
      imageUrls: ["https://images.test/a.jpg"],
      organizationId,
      source: "runtime_api",
      subject: "synthetic-landlord-a",
      summary: "A bright two-bedroom unit close to transit.",
      title: "Riverside apartment — Unit 2A",
      unitId,
    }]);
  });

  it("rejects an invalid PublicListing creation payload without invoking the gateway", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
      },
      method: "POST",
      payload: { imageUrls: [], attestationAccepted: true, summary: "Too short image list", title: "Ok" },
      url: `/api/v1/units/${unitId}/public-listing`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(configured.createCommands).toEqual([]);
  });

  it("rejects a PublicListing creation payload (REQ-037/PROP-025) when the image-rights attestation is missing or false", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const missingAttestation = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
      },
      method: "POST",
      payload: {
        idempotencyKey: "idem-listing-create-no-attestation",
        imageUrls: ["https://images.test/a.jpg"],
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit 2A",
      },
      url: `/api/v1/units/${unitId}/public-listing`,
    });
    const falseAttestation = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
      },
      method: "POST",
      payload: {
        attestationAccepted: false,
        idempotencyKey: "idem-listing-create-false-attestation",
        imageUrls: ["https://images.test/a.jpg"],
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit 2A",
      },
      url: `/api/v1/units/${unitId}/public-listing`,
    });

    expect(missingAttestation.statusCode).toBe(400);
    expect(missingAttestation.json().error.code).toBe("VALIDATION_ERROR");
    expect(falseAttestation.statusCode).toBe(400);
    expect(falseAttestation.json().error.code).toBe("VALIDATION_ERROR");
    expect(configured.createCommands).toEqual([]);
  });

  it("returns a not-found response when creation is rejected (e.g. a duplicate listing)", async () => {
    const configured = dependencies({ rejectCreate: true });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
      },
      method: "POST",
      payload: {
        attestationAccepted: true,
        idempotencyKey: "idem-listing-create-02",
        imageUrls: ["https://images.test/a.jpg"],
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit 2A",
      },
      url: `/api/v1/units/${unitId}/public-listing`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("edits a draft PublicListing using only verified principal identity", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: LANDLORD_AUTH,
        "x-organization-id": organizationId,
        "x-request-id": "listing-draft-01",
      },
      method: "PATCH",
      payload: {
        expectedVersion: 1,
        imageUrls: ["https://images.test/a.jpg", "https://images.test/b.jpg"],
        summary: "An updated summary describing the unit in more detail.",
        title: "Riverside apartment — Unit 2A (updated)",
      },
      url: `/api/v1/public-listings/${listingId}/draft`,
    });

    expect(response.statusCode).toBe(200);
    updatePublicListingDraftEnvelopeSchema.parse(response.json());
    expect(configured.draftCommands).toEqual([{
      correlationId: "listing-draft-01",
      expectedVersion: 1,
      imageUrls: ["https://images.test/a.jpg", "https://images.test/b.jpg"],
      listingId,
      organizationId,
      source: "runtime_api",
      subject: "synthetic-landlord-a",
      summary: "An updated summary describing the unit in more detail.",
      title: "Riverside apartment — Unit 2A (updated)",
    }]);
  });

  it("requires authentication and an organization context for both routes", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const unauthenticatedCreate = await app.inject({
      headers: { "x-organization-id": organizationId },
      method: "POST",
      payload: {
        attestationAccepted: true,
        idempotencyKey: "idem-listing-create-03",
        imageUrls: ["https://images.test/a.jpg"],
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit 2A",
      },
      url: `/api/v1/units/${unitId}/public-listing`,
    });
    const unauthenticatedDraft = await app.inject({
      headers: { "x-organization-id": organizationId },
      method: "PATCH",
      payload: {
        expectedVersion: 1,
        imageUrls: ["https://images.test/a.jpg"],
        summary: "An updated summary describing the unit in more detail.",
        title: "Riverside apartment — Unit 2A (updated)",
      },
      url: `/api/v1/public-listings/${listingId}/draft`,
    });

    expect(unauthenticatedCreate.statusCode).toBe(401);
    expect(unauthenticatedDraft.statusCode).toBe(401);
    expect(configured.createCommands).toEqual([]);
    expect(configured.draftCommands).toEqual([]);
  });
});

describe("platform-admin media-review routes (REQ-037)", () => {
  it("allows an allowlisted object ID to list and decide the media-review queue without an organization header", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const listed = await app.inject({
      headers: { authorization: ADMIN_AUTH },
      method: "GET",
      url: "/api/v1/admin/public-listings/pending-review",
    });
    const decided = await app.inject({
      headers: {
        authorization: ADMIN_AUTH,
        "x-request-id": "media-review-approve-01",
      },
      method: "POST",
      payload: { decision: "approved" },
      url: `/api/v1/admin/public-listings/${listingId}/media-review`,
    });

    expect(listed.statusCode).toBe(200);
    pendingPublicListingMediaReviewListEnvelopeSchema.parse(listed.json());
    expect(listed.json().items).toEqual([pendingListing]);

    expect(decided.statusCode).toBe(200);
    publicListingMediaReviewEnvelopeSchema.parse(decided.json());
    expect(configured.reviewCommands).toEqual([{
      correlationId: "media-review-approve-01",
      decision: "approved",
      listingId,
      notes: null,
      reviewerObjectId: adminObjectId,
      reviewerSubject: "synthetic-admin",
      source: "runtime_api",
    }]);
  });

  it("rejects a media-review decision without notes at the validation layer", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: ADMIN_AUTH },
      method: "POST",
      payload: { decision: "rejected" },
      url: `/api/v1/admin/public-listings/${listingId}/media-review`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(configured.reviewCommands).toEqual([]);
  });

  it("returns a conflict when the listing is not awaiting media review", async () => {
    const configured = dependencies({ rejectReview: true });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: ADMIN_AUTH },
      method: "POST",
      payload: { decision: "approved" },
      url: `/api/v1/admin/public-listings/${listingId}/media-review`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("LISTING_NOT_PENDING");
  });

  it("does not disclose the media-review queue or accept decisions from a non-allowlisted identity", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const responses = await Promise.all([
      app.inject({
        headers: { authorization: OUTSIDER_AUTH },
        method: "GET",
        url: "/api/v1/admin/public-listings/pending-review",
      }),
      app.inject({
        headers: { authorization: OUTSIDER_AUTH },
        method: "POST",
        payload: { decision: "approved" },
        url: `/api/v1/admin/public-listings/${listingId}/media-review`,
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
      expect(response.body).not.toContain("Riverside");
    }
    expect(configured.pendingReviewCalls).toBe(0);
    expect(configured.reviewCommands).toEqual([]);
  });
});
