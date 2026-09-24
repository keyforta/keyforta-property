import { describe, expect, it } from "vitest";

import type { DatabaseClient, DatabaseSession } from "../src/database.js";
import { RentalInventoryAuthorizationError } from "../src/properties/inventory-command-gateway.js";
import { createPostgresPublicListingMediaGateway } from "../src/properties/media-gateway.js";

describe("PostgreSQL public listing media gateway", () => {
  it("resolves the actor, uploads an image, and resets media review in one transaction", async () => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const session: DatabaseSession = {
      async query(text, parameters = []) {
        queries.push({ parameters, text });
        if (text.includes("resolve_actor")) {
          return { rows: [{ actor_id: "00000000-0000-4000-8000-000000000940" }] };
        }
        if (text.includes("upload_public_listing_image")) {
          return {
            rows: [{
              image_id: "00000000-0000-4000-8000-000000000981",
              listing_id: "00000000-0000-4000-8000-000000000930",
              listing_version: 2,
              image_position: 0,
            }],
          };
        }
        return { rows: [] };
      },
    };
    let transactions = 0;
    const client: DatabaseClient = {
      query: session.query,
      async transaction(operation) {
        transactions += 1;
        return operation(session);
      },
    };
    const gateway = createPostgresPublicListingMediaGateway(client);

    await expect(gateway.uploadImage({
      content: Buffer.from("jpeg-bytes"),
      contentHash: "a".repeat(64),
      correlationId: "image-upload-01",
      listingId: "00000000-0000-4000-8000-000000000930",
      mediaType: "image/jpeg",
      organizationId: "00000000-0000-4000-8000-000000000900",
      room: "kitchen",
      sizeBytes: 10,
      source: "test",
      subject: "synthetic-landlord-a",
    })).resolves.toEqual({
      imageId: "00000000-0000-4000-8000-000000000981",
      listingId: "00000000-0000-4000-8000-000000000930",
      listingVersion: 2,
      position: 0,
    });

    expect(transactions).toBe(1);
    expect(queries[0]).toMatchObject({ text: expect.stringContaining("app.resolve_actor") });
    expect(queries.some((q) => q.text.includes("app.upload_public_listing_image"))).toBe(true);
  });

  it("denies an actor with no active membership without attempting the upload", async () => {
    const queries: string[] = [];
    const session: DatabaseSession = {
      async query(text) {
        queries.push(text);
        return { rows: [] };
      },
    };
    const gateway = createPostgresPublicListingMediaGateway({
      query: session.query,
      transaction: (operation) => operation(session),
    });

    await expect(gateway.uploadImage({
      content: Buffer.from("jpeg-bytes"),
      contentHash: "a".repeat(64),
      correlationId: "image-upload-denied",
      listingId: "00000000-0000-4000-8000-000000000930",
      mediaType: "image/jpeg",
      organizationId: "00000000-0000-4000-8000-000000000901",
      room: "kitchen",
      sizeBytes: 10,
      source: "test",
      subject: "synthetic-outsider",
    })).rejects.toThrow(RentalInventoryAuthorizationError);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("app.resolve_actor");
  });

  it("resolves the actor and checks upload authorization in one transaction", async () => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const session: DatabaseSession = {
      async query(text, parameters = []) {
        queries.push({ parameters, text });
        if (text.includes("resolve_actor")) {
          return { rows: [{ actor_id: "00000000-0000-4000-8000-000000000940" }] };
        }
        if (text.includes("actor_can_upload_public_listing_image")) {
          return { rows: [{ allowed: true }] };
        }
        return { rows: [] };
      },
    };
    let transactions = 0;
    const client: DatabaseClient = {
      query: session.query,
      async transaction(operation) {
        transactions += 1;
        return operation(session);
      },
    };
    const gateway = createPostgresPublicListingMediaGateway(client);

    await expect(gateway.canActorUploadImage({
      listingId: "00000000-0000-4000-8000-000000000930",
      organizationId: "00000000-0000-4000-8000-000000000900",
      subject: "synthetic-landlord-a",
    })).resolves.toBe(true);

    expect(transactions).toBe(1);
    expect(queries[0]).toMatchObject({ text: expect.stringContaining("app.resolve_actor") });
    expect(
      queries.some((q) => q.text.includes("app.actor_can_upload_public_listing_image")),
    ).toBe(true);
  });

  it("resolves false, not an authorization error, for an actor with no active organization membership", async () => {
    const session: DatabaseSession = {
      async query() {
        return { rows: [] };
      },
    };
    const gateway = createPostgresPublicListingMediaGateway({
      query: session.query,
      transaction: (operation) => operation(session),
    });

    await expect(gateway.canActorUploadImage({
      listingId: "00000000-0000-4000-8000-000000000930",
      organizationId: "00000000-0000-4000-8000-000000000901",
      subject: "synthetic-outsider",
    })).resolves.toBe(false);
  });

  it("resolves the actor and deletes an image in one transaction", async () => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const session: DatabaseSession = {
      async query(text, parameters = []) {
        queries.push({ parameters, text });
        if (text.includes("resolve_actor")) {
          return { rows: [{ actor_id: "00000000-0000-4000-8000-000000000940" }] };
        }
        if (text.includes("delete_public_listing_image")) {
          return {
            rows: [{
              listing_id: "00000000-0000-4000-8000-000000000930",
              listing_version: 3,
            }],
          };
        }
        return { rows: [] };
      },
    };
    const client: DatabaseClient = {
      query: session.query,
      async transaction(operation) {
        return operation(session);
      },
    };
    const gateway = createPostgresPublicListingMediaGateway(client);

    await expect(gateway.deleteImage({
      correlationId: "image-delete-01",
      imageId: "00000000-0000-4000-8000-000000000981",
      listingId: "00000000-0000-4000-8000-000000000930",
      organizationId: "00000000-0000-4000-8000-000000000900",
      source: "test",
      subject: "synthetic-landlord-a",
    })).resolves.toEqual({
      listingId: "00000000-0000-4000-8000-000000000930",
      listingVersion: 3,
    });
  });

  it("resolves the actor and lists metadata-only image rows", async () => {
    const rows = [{
      image_id: "00000000-0000-4000-8000-000000000981",
      room: "kitchen",
      media_type: "image/jpeg",
      size_bytes: 1024,
      image_position: 0,
      created_at: "2026-09-22T00:00:00.000Z",
    }];
    const session: DatabaseSession = {
      async query(text) {
        if (text.includes("resolve_actor")) {
          return { rows: [{ actor_id: "00000000-0000-4000-8000-000000000940" }] };
        }
        return text.includes("list_public_listing_images_for_actor")
          ? { rows }
          : { rows: [] };
      },
    };
    const gateway = createPostgresPublicListingMediaGateway({
      query: session.query,
      transaction: (operation) => operation(session),
    });

    await expect(gateway.listImages({
      listingId: "00000000-0000-4000-8000-000000000930",
      organizationId: "00000000-0000-4000-8000-000000000900",
      subject: "synthetic-landlord-a",
    })).resolves.toEqual([{
      createdAt: "2026-09-22T00:00:00.000Z",
      imageId: "00000000-0000-4000-8000-000000000981",
      mediaType: "image/jpeg",
      position: 0,
      room: "kitchen",
      sizeBytes: 1024,
    }]);
  });

  it("lists the anonymous room-grouped image feed without resolving an actor", async () => {
    const queries: string[] = [];
    const rows = [{ image_id: "00000000-0000-4000-8000-000000000981", room: "kitchen", image_position: 0 }];
    const client: DatabaseClient = {
      async query(text) {
        queries.push(text);
        return { rows };
      },
      async transaction(operation) {
        return operation({ query: this.query.bind(this) });
      },
    };
    const gateway = createPostgresPublicListingMediaGateway(client);

    await expect(gateway.listPublicImagesByRoom("00000000-0000-4000-8000-000000000930"))
      .resolves.toEqual([{ imageId: "00000000-0000-4000-8000-000000000981", position: 0, room: "kitchen" }]);
    expect(queries.some((text) => text.includes("app.list_public_listing_images_by_room"))).toBe(true);
    expect(queries.some((text) => text.includes("resolve_actor"))).toBe(false);
  });

  it("serves image content for the anonymous public path without resolving an actor", async () => {
    const queries: string[] = [];
    const client: DatabaseClient = {
      async query(text) {
        queries.push(text);
        return { rows: [{ media_type: "image/jpeg", content: Buffer.from("bytes") }] };
      },
      async transaction(operation) {
        return operation({ query: this.query.bind(this) });
      },
    };
    const gateway = createPostgresPublicListingMediaGateway(client);

    await expect(
      gateway.getPublicImageContent(
        "00000000-0000-4000-8000-000000000930",
        "00000000-0000-4000-8000-000000000981",
      ),
    ).resolves.toEqual({ content: Buffer.from("bytes"), mediaType: "image/jpeg" });
    expect(queries.some((text) => text.includes("app.get_public_listing_image_content"))).toBe(true);
    expect(queries.some((text) => text.includes("resolve_actor"))).toBe(false);
  });

  it("returns undefined when public image content is not found (not eligible / withdrawn / draft)", async () => {
    const client: DatabaseClient = {
      async query() {
        return { rows: [] };
      },
      async transaction(operation) {
        return operation({ query: this.query.bind(this) });
      },
    };
    const gateway = createPostgresPublicListingMediaGateway(client);

    await expect(
      gateway.getPublicImageContent(
        "00000000-0000-4000-8000-000000000930",
        "00000000-0000-4000-8000-000000000981",
      ),
    ).resolves.toBeUndefined();
  });

  it("serves image content for the platform-admin review path without resolving an actor", async () => {
    const queries: string[] = [];
    const client: DatabaseClient = {
      async query(text) {
        queries.push(text);
        return { rows: [{ media_type: "image/png", content: Buffer.from("review-bytes") }] };
      },
      async transaction(operation) {
        return operation({ query: this.query.bind(this) });
      },
    };
    const gateway = createPostgresPublicListingMediaGateway(client);

    await expect(
      gateway.getReviewImageContent(
        "00000000-0000-4000-8000-000000000930",
        "00000000-0000-4000-8000-000000000981",
      ),
    ).resolves.toEqual({ content: Buffer.from("review-bytes"), mediaType: "image/png" });
    expect(
      queries.some((text) => text.includes("app.get_public_listing_image_content_for_review")),
    ).toBe(true);
    expect(queries.some((text) => text.includes("resolve_actor"))).toBe(false);
  });

  it("returns undefined for review image content once a listing is no longer pending review", async () => {
    const client: DatabaseClient = {
      async query() {
        return { rows: [] };
      },
      async transaction(operation) {
        return operation({ query: this.query.bind(this) });
      },
    };
    const gateway = createPostgresPublicListingMediaGateway(client);

    await expect(
      gateway.getReviewImageContent(
        "00000000-0000-4000-8000-000000000930",
        "00000000-0000-4000-8000-000000000981",
      ),
    ).resolves.toBeUndefined();
  });
});
