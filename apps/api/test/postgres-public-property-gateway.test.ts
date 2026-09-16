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
          rows: [
            {
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
            },
            {
              amenities: ["Parking"],
              area_square_meters: null,
              available_from: "2026-10-15",
              bathrooms: 2,
              bedrooms: 3,
              city: "Kinshasa",
              currency: "USD",
              district: "Limete",
              image_urls: ["/images/second.jpg"],
              monthly_rent_minor: "65000",
              slug: "maison-limete",
              summary: "Second synthetic published listing.",
              title: "Maison Limete",
            },
          ],
        };
      },
    };
    const gateway = createPostgresPublicPropertyGateway(client);

    const result = await gateway.list({
      cursor: "appartement-gombe",
      district: "Limete",
      limit: 1,
      maxMonthlyRentMinor: "70000",
      minBedrooms: 2,
      sort: "created_at_desc",
    });

    expect(queries).toEqual([
      {
        parameters: ["Limete", 2, "70000"],
        text: expect.stringContaining("app.list_public_listings"),
      },
    ]);
    expect(result).toEqual({
      items: [
        {
          address: "Limete",
          amenities: ["Parking"],
          availableFrom: "2026-10-15",
          bathrooms: 2,
          bedrooms: 3,
          city: "Kinshasa",
          currency: "USD",
          district: "Limete",
          id: "maison-limete",
          imageUrl: "/images/second.jpg",
          imageUrls: ["/images/second.jpg"],
          monthlyRentMinor: "65000",
          name: "Maison Limete",
          summary: "Second synthetic published listing.",
        },
      ],
      nextCursor: null,
      total: 2,
    });
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
      monthlyRentMinor: "40000",
      name: "Appartement Gombe",
      summary: "Synthetic published listing.",
    });
  });
});