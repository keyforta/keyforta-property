import { describe, expect, it } from "vitest";

import { createPostgresPublicPropertyGateway } from "../src/properties/postgres-gateway.js";
import { createPostgresPublicViewingRequestGateway } from "../src/properties/viewing-gateway.js";

describe("PostgreSQL public property gateway", () => {
  it("maps only the public listing projection and preserves cursor pagination", async () => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const client = {
      async query(text: string, parameters: readonly unknown[] = []) {
        queries.push({ parameters, text });
        return {
          rows: [{
            cursor_valid: true,
            items: [{
              amenities: ["Water"],
              area_square_meters: 72,
              available_from: new Date(2026, 9, 1),
              bathrooms: 1,
              bedrooms: 2,
              city: "Kinshasa",
              currency: "USD",
              district: "Limete",
              image_urls: ["/images/listing.jpg"],
              monthly_rent_minor: "40000",
              slug: "appartement-gombe",
              summary: "Synthetic published listing.",
              title: "Appartement Gombe",
            }],
            next_cursor: "appartement-gombe",
            total_count: "2",
          }],
        };
      },
    };
    const gateway = createPostgresPublicPropertyGateway(client);

    const result = await gateway.list({
      city: "Kinshasa",
      cursor: "maison-limete",
      district: "Limete",
      limit: 1,
      maxMonthlyRentMinor: "70000",
      minBedrooms: 2,
      sort: "created_at_desc",
    });

    expect(queries).toEqual([
      {
        parameters: [
          "Kinshasa",
          "Limete",
          2,
          "70000",
          "created_at_desc",
          "maison-limete",
          1,
        ],
        text: expect.stringContaining("app.list_public_listings_page"),
      },
    ]);
    expect(result).toEqual({
      items: [
        {
          address: "Limete",
          amenities: ["Water"],
          availableFrom: "2026-10-01",
          bathrooms: 1,
          bedrooms: 2,
          city: "Kinshasa",
          currency: "USD",
          district: "Limete",
          id: "appartement-gombe",
          imageUrl: "/images/listing.jpg",
          imageUrls: ["/images/listing.jpg"],
          monthlyRentMinor: "40000",
          name: "Appartement Gombe",
          summary: "Synthetic published listing.",
          areaSquareMeters: 72,
        },
      ],
      nextCursor: "appartement-gombe",
      total: 2,
    });
  });

  it("rejects a cursor that is outside the filtered database result", async () => {
    const client = {
      async query() {
        return {
          rows: [{
            cursor_valid: false,
            items: [],
            next_cursor: null,
            total_count: "1",
          }],
        };
      },
    };
    const gateway = createPostgresPublicPropertyGateway(client);

    await expect(gateway.list({
      cursor: "missing-listing",
      limit: 20,
      sort: "created_at_desc",
    })).rejects.toThrow("The public property cursor is invalid.");
  });

  it("persists a correlated inquiry through the serialized database command", async () => {
    const client = {
      async query(text: string, parameters: readonly unknown[] = []) {
        expect(text).toContain("app.create_public_listing_inquiry");
        expect(parameters).toEqual([
          "appartement-gombe",
          "Visiteur Test",
          "visitor@example.test",
          null,
          "2026-10-02T10:00:00.000Z",
          "Visite matinale",
          "fr",
          "request-01",
        ]);
        return { rows: [{ accepted: true }] };
      },
    };
    const gateway = createPostgresPublicViewingRequestGateway(client);

    await expect(
      gateway.create({
        correlationId: "request-01",
        email: "visitor@example.test",
        locale: "fr",
        message: "Visite matinale",
        name: "Visiteur Test",
        preferredAt: "2026-10-02T10:00:00.000Z",
        propertyId: "appartement-gombe",
      }),
    ).resolves.toBe(true);
  });

  it("loads detail by stable public slug", async () => {
    const client = {
      async query(text: string, parameters: readonly unknown[] = []) {
        expect(text).toContain("app.get_public_listing");
        expect(parameters).toEqual(["appartement-gombe"]);
        return {
          rows: [
            {
              amenities: ["Water"],
              area_square_meters: null,
              available_from: "2026-10-01",
              bathrooms: 1,
              bedrooms: 2,
              city: "Kinshasa",
              currency: "USD",
              district: "Gombe",
              id: "00000000-0000-4000-8000-000000000901",
              image_urls: [],
              monthly_rent_minor: "40000",
              organization_id: "must-not-leave-the-gateway",
              slug: "appartement-gombe",
              summary: "Synthetic published listing.",
              title: "Appartement Gombe",
              unit_id: "must-not-leave-the-gateway",
            },
          ],
        };
      },
    };
    const gateway = createPostgresPublicPropertyGateway(client);

    await expect(gateway.findById("appartement-gombe")).resolves.toEqual({
      address: "Gombe",
      amenities: ["Water"],
      availableFrom: "2026-10-01",
      bathrooms: 1,
      bedrooms: 2,
      city: "Kinshasa",
      currency: "USD",
      district: "Gombe",
      id: "appartement-gombe",
      imageUrls: [],
      listingId: "00000000-0000-4000-8000-000000000901",
      monthlyRentMinor: "40000",
      name: "Appartement Gombe",
      summary: "Synthetic published listing.",
    });
  });

  // The browse/list page's aggregated JSON items never carry the
  // PublicListing uuid (only `app.get_public_listing`'s single-row lookup
  // does), so `listingId` must stay absent there rather than throwing or
  // defaulting to something misleading.
  it("omits listingId from browse/list results, which never carry the PublicListing uuid", async () => {
    const client = {
      async query() {
        return {
          rows: [{
            cursor_valid: true,
            items: [{
              amenities: [],
              area_square_meters: null,
              available_from: new Date(2026, 9, 1),
              bathrooms: 1,
              bedrooms: 2,
              city: "Kinshasa",
              currency: "USD",
              district: "Limete",
              image_urls: [],
              monthly_rent_minor: "40000",
              slug: "appartement-gombe",
              summary: "Synthetic published listing.",
              title: "Appartement Gombe",
            }],
            next_cursor: null,
            total_count: "1",
          }],
        };
      },
    };
    const gateway = createPostgresPublicPropertyGateway(client);

    const result = await gateway.list({ limit: 1, sort: "created_at_desc" });
    expect(result.items[0]).not.toHaveProperty("listingId");
  });
});