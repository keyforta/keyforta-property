import { afterEach, describe, expect, it } from "vitest";
import {
  problemSchema,
  publicListingPublicationEnvelopeSchema,
  publicPropertyEnvelopeSchema,
  publicPropertyListEnvelopeSchema,
  publicRequestReceiptEnvelopeSchema,
} from "@keyforta/contracts";

import { buildApp, parseCorsOrigins } from "../src/app.js";
import { createMemoryPublicPropertyGateway } from "../src/properties/gateway.js";
import { createMemoryPublicViewingRequestGateway } from "../src/properties/viewing-gateway.js";
import type { PublicListingPublicationGateway } from "../src/properties/publication-gateway.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

const propertyRecords = [
  {
    address: "10 Market Street",
    amenities: ["Water"],
    availableFrom: "2026-10-01",
    bathrooms: 1,
    bedrooms: 2,
    city: "Kinshasa",
    createdAt: "2026-09-01T09:00:00.000Z",
    currency: "USD",
    district: "Gombe",
    id: "property_alpha_01",
    imageUrl: "/images/property-alpha.jpg",
    imageUrls: ["/images/property-alpha.jpg"],
    monthlyRentMinor: "40000",
    name: "Alpha Residence",
    published: true,
    summary: "Synthetic public property fixture.",
  },
  {
    address: "20 River Road",
    amenities: ["Parking"],
    availableFrom: "2026-10-15",
    bathrooms: 2,
    bedrooms: 3,
    city: "Kinshasa",
    createdAt: "2026-09-02T09:00:00.000Z",
    currency: "USD",
    district: "Limete",
    id: "property_bravo_02",
    imageUrls: ["/images/property-bravo.jpg"],
    monthlyRentMinor: "65000",
    name: "Bravo Court",
    published: true,
    summary: "Second synthetic public property fixture.",
  },
  {
    address: "30 Private Avenue",
    amenities: ["Private"],
    availableFrom: "2026-11-01",
    bathrooms: 1,
    bedrooms: 1,
    city: "Kinshasa",
    createdAt: "2026-09-03T09:00:00.000Z",
    currency: "USD",
    district: "Ngaliema",
    id: "property_private_03",
    imageUrls: ["/images/private.jpg"],
    monthlyRentMinor: "25000",
    name: "Unpublished Property",
    published: false,
    summary: "This fixture must never leave the gateway.",
  },
] as const;

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("KEYFORTA API runtime", () => {
  it("serves only implemented API documentation when explicitly enabled", async () => {
    const disabledApp = await buildApp();
    const enabledApp = await buildApp({ apiDocs: true });
    apps.push(disabledApp, enabledApp);

    const disabled = await disabledApp.inject({
      method: "GET",
      url: "/api/docs/json",
    });
    const html = await enabledApp.inject({
      method: "GET",
      url: "/api/docs/",
    });
    const specification = await enabledApp.inject({
      method: "GET",
      url: "/api/docs/json",
    });

    expect(disabled.statusCode).toBe(404);
    expect(html.statusCode).toBe(200);
    expect(html.headers["content-type"]).toContain("text/html");
    expect(specification.statusCode).toBe(200);

    const document = specification.json();
    expect(document.servers).toEqual([{ url: "/api/v1" }]);
    expect(Object.keys(document.paths).sort()).toEqual([
      "/landlord-onboarding-applications",
      "/landlord-onboarding-applications/{applicationId}/decision",
      "/properties",
      "/properties/{propertyId}",
      "/public-listings/{listingId}/publish",
      "/public-listings/{listingId}/withdraw",
      "/viewing-requests",
    ]);
    expect(document.paths["/properties"].post).toBeUndefined();
    expect(document.paths["/leases"]).toBeUndefined();
  });

  it("parses only exact secure CORS origins", () => {
    expect(parseCorsOrigins("https://web.example.test,https://admin.example.test"))
      .toEqual(["https://web.example.test", "https://admin.example.test"]);
    expect(parseCorsOrigins("http://127.0.0.1:3000")).toEqual([
      "http://127.0.0.1:3000",
    ]);
    expect(() => parseCorsOrigins("https://web.example.test/path")).toThrow();
    expect(() => parseCorsOrigins("http://web.example.test")).toThrow();
    expect(() => parseCorsOrigins("https://web.example.test,")).toThrow();
  });

  it("allows only the configured browser origin", async () => {
    const app = await buildApp({ corsOrigin: "https://web.example.test" });
    apps.push(app);

    const allowed = await app.inject({
      headers: { origin: "https://web.example.test" },
      method: "GET",
      url: "/health",
    });
    const denied = await app.inject({
      headers: { origin: "https://attacker.example.test" },
      method: "GET",
      url: "/health",
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://web.example.test",
    );
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(allowed.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("allows only the configured public and admin browser origins", async () => {
    const app = await buildApp({
      corsOrigin: ["https://web.example.test", "https://admin.example.test"],
    });
    apps.push(app);

    for (const origin of [
      "https://web.example.test",
      "https://admin.example.test",
    ]) {
      const response = await app.inject({
        headers: { origin },
        method: "GET",
        url: "/health",
      });
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
    }

    const denied = await app.inject({
      headers: { origin: "https://attacker.example.test" },
      method: "GET",
      url: "/health",
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("reports process health with a correlation ID", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({
      meta: { requestId: expect.any(String) },
      service: "keyforta-api",
      status: "ok",
    });
    expect(response.headers["x-request-id"]).toBe(body.meta.requestId);
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("reports readiness when dependencies are available", async () => {
    const app = await buildApp({
      publicProperties: createMemoryPublicPropertyGateway(propertyRecords),
      readiness: async () => undefined,
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      meta: { requestId: expect.any(String) },
      service: "keyforta-api",
      status: "ready",
    });
  });

  it("propagates a valid request ID and replaces an invalid one", async () => {
    const app = await buildApp();
    apps.push(app);

    const propagated = await app.inject({
      headers: { "x-request-id": "request:test-123" },
      method: "GET",
      url: "/health",
    });
    const replaced = await app.inject({
      headers: { "x-request-id": "invalid request id" },
      method: "GET",
      url: "/health",
    });

    expect(propagated.headers["x-request-id"]).toBe("request:test-123");
    expect(propagated.json().meta.requestId).toBe("request:test-123");
    expect(replaced.headers["x-request-id"]).not.toBe("invalid request id");
  });

  it("returns a stable correlated error for unknown routes", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/missing" });
    const body = response.json();

    expect(response.statusCode).toBe(404);
    expect(body.error).toMatchObject({
      code: "NOT_FOUND",
      traceId: expect.any(String),
    });
    problemSchema.parse(body);
    expect(response.headers["x-request-id"]).toBe(body.error.traceId);
  });

  it("sanitizes and correlates malformed URLs", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/properties/%world",
    });
    const body = response.json();

    expect(response.statusCode).toBe(400);
    expect(body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "The request URL is invalid.",
      traceId: expect.any(String),
    });
    expect(response.headers["x-request-id"]).toBe(body.error.traceId);
    expect(response.body).not.toContain("FST_ERR_BAD_URL");
  });

  it("reports dependency readiness without exposing failure details", async () => {
    const app = await buildApp({
      readiness: async () => {
        throw new Error("sensitive dependency location");
      },
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      service: "keyforta-api",
      status: "not_ready",
      traceId: expect.any(String),
    });
    expect(response.body).not.toContain("sensitive dependency location");
  });
});

describe("anonymous public property discovery", () => {
  it("returns dependency unavailable when no projection gateway exists", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/properties",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      traceId: expect.any(String),
    });
  });

  it("lists filtered published projections in the canonical envelope", async () => {
    const app = await buildApp({
      publicProperties: createMemoryPublicPropertyGateway(propertyRecords),
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/properties?city=kinshasa&limit=1&sort=name_asc",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    publicPropertyListEnvelopeSchema.parse(body);
    expect(body).toEqual({
      items: [
        {
          address: "Gombe",
          amenities: ["Water"],
          availableFrom: "2026-10-01",
          bathrooms: 1,
          bedrooms: 2,
          city: "Kinshasa",
          currency: "USD",
          district: "Gombe",
          id: "property_alpha_01",
          imageUrl: "/images/property-alpha.jpg",
          imageUrls: ["/images/property-alpha.jpg"],
          monthlyRentMinor: "40000",
          name: "Alpha Residence",
          summary: "Synthetic public property fixture.",
        },
      ],
      meta: { requestId: expect.any(String) },
      nextCursor: "property_alpha_01",
      total: 2,
    });
    expect(response.body).not.toContain("Unpublished Property");
    expect(response.body).not.toContain("published");
  });

  it("returns a published property detail in the canonical envelope", async () => {
    const app = await buildApp({
      publicProperties: createMemoryPublicPropertyGateway(propertyRecords),
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/properties/property_bravo_02",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    publicPropertyEnvelopeSchema.parse(body);
    expect(body).toEqual({
      data: {
        address: "Limete",
        amenities: ["Parking"],
        availableFrom: "2026-10-15",
        bathrooms: 2,
        bedrooms: 3,
        city: "Kinshasa",
        currency: "USD",
        district: "Limete",
        id: "property_bravo_02",
        imageUrls: ["/images/property-bravo.jpg"],
        monthlyRentMinor: "65000",
        name: "Bravo Court",
        summary: "Second synthetic public property fixture.",
      },
      meta: { requestId: expect.any(String) },
    });
  });

  it("strips private fields returned by a misbehaving gateway", async () => {
    const privateFields = {
      organizationId: "organization_private",
      ownerId: "owner_private",
      privateNote: "must not leave the API",
      published: false,
    };
    const publicProperty = {
      address: "40 Boundary Road",
      amenities: ["Water"],
      availableFrom: "2026-10-01",
      bathrooms: 1,
      bedrooms: 1,
      city: "Kinshasa",
      currency: "USD",
      district: "Bandalungwa",
      id: "property_boundary_04",
      imageUrls: ["/images/boundary.jpg"],
      monthlyRentMinor: "30000",
      name: "Boundary Residence",
      summary: "Synthetic boundary fixture.",
    };
    const app = await buildApp({
      publicProperties: {
        async findById() {
          return { ...publicProperty, ...privateFields };
        },
        async list() {
          return {
            items: [{ ...publicProperty, ...privateFields }],
            nextCursor: null,
            privateNote: privateFields.privateNote,
            total: 1,
          };
        },
      },
    });
    apps.push(app);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/properties",
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/properties/${publicProperty.id}`,
    });

    for (const response of [listResponse, detailResponse]) {
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("organization_private");
      expect(response.body).not.toContain("owner_private");
      expect(response.body).not.toContain("must not leave the API");
      expect(response.body).not.toContain("published");
      expect(response.body).not.toContain("40 Boundary Road");
      expect(response.json().items?.[0]?.address ?? response.json().data?.address).toBe(
        "Bandalungwa",
      );
    }
  });

  it("hides unpublished and missing property details", async () => {
    const app = await buildApp({
      publicProperties: createMemoryPublicPropertyGateway(propertyRecords),
    });
    apps.push(app);

    for (const propertyId of ["property_private_03", "property_missing_99"]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/properties/${propertyId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("rejects invalid query and path input", async () => {
    const app = await buildApp({
      publicProperties: createMemoryPublicPropertyGateway(propertyRecords),
    });
    apps.push(app);

    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/properties?limit=0" }),
      app.inject({ method: "GET", url: "/api/v1/properties/%20" }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatchObject({
        code: "VALIDATION_ERROR",
        traceId: expect.any(String),
      });
    }
  });

  it("rejects an unknown pagination cursor instead of restarting", async () => {
    const app = await buildApp({
      publicProperties: createMemoryPublicPropertyGateway(propertyRecords),
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/properties?cursor=property_missing_99",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: "VALIDATION_ERROR",
      traceId: expect.any(String),
    });
  });

  it("sanitizes gateway failures and correlates the response", async () => {
    const app = await buildApp({
      publicProperties: {
        async findById() {
          return undefined;
        },
        async list() {
          throw new Error("private connection details");
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/properties",
    });
    const body = response.json();

    expect(response.statusCode).toBe(500);
    expect(body.error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      traceId: expect.any(String),
    });
    expect(response.headers["x-request-id"]).toBe(body.error.traceId);
    expect(response.body).not.toContain("private connection details");
  });
});

describe("protected public listing publication", () => {
  const listingId = "00000000-0000-4000-8000-000000000930";
  const organizationId = "00000000-0000-4000-8000-000000000900";

  function createDependencies(changed = true) {
    const commands: Parameters<PublicListingPublicationGateway["setPublication"]>[0][] = [];
    return {
      authenticator: {
        async authenticate(authorization: string) {
          expect(authorization).toBe("Bearer synthetic-token");
          return {
            objectId: "00000000-0000-4000-8000-000000000701",
            subject: "synthetic-landlord-a",
          };
        },
      },
      commands,
      publicListingPublication: {
        async setPublication(command: Parameters<PublicListingPublicationGateway["setPublication"]>[0]) {
          commands.push(command);
          return changed;
        },
      },
    };
  }

  it.each([
    ["publish", true],
    ["withdraw", false],
  ] as const)("authenticates and executes the %s command with trusted context", async (command, published) => {
    const dependencies = createDependencies();
    const app = await buildApp(dependencies);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: "Bearer synthetic-token",
        "x-organization-id": organizationId,
        "x-request-id": `publication-${command}`,
      },
      method: "POST",
      payload: {
        organizationId: "00000000-0000-4000-8000-000000000999",
        subject: "untrusted-body-subject",
      },
      url: `/api/v1/public-listings/${listingId}/${command}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    publicListingPublicationEnvelopeSchema.parse(body);
    expect(body).toEqual({
      data: { listingId, status: published ? "published" : "withdrawn" },
      meta: { requestId: `publication-${command}` },
    });
    expect(dependencies.commands).toEqual([{
      correlationId: `publication-${command}`,
      listingId,
      organizationId,
      published,
      subject: "synthetic-landlord-a",
    }]);
  });

  it("requires a configured authenticator and bearer credential", async () => {
    const withoutVerifier = await buildApp({
      publicListingPublication: createDependencies().publicListingPublication,
    });
    const withVerifier = await buildApp(createDependencies());
    apps.push(withoutVerifier, withVerifier);

    const unavailable = await withoutVerifier.inject({
      headers: { "x-organization-id": organizationId },
      method: "POST",
      url: `/api/v1/public-listings/${listingId}/publish`,
    });
    const unauthenticated = await withVerifier.inject({
      headers: { "x-organization-id": organizationId },
      method: "POST",
      url: `/api/v1/public-listings/${listingId}/publish`,
    });

    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("validates organization and listing IDs before invoking the gateway", async () => {
    const dependencies = createDependencies();
    const app = await buildApp(dependencies);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: "Bearer synthetic-token",
        "x-organization-id": "untrusted-organization",
      },
      method: "POST",
      url: "/api/v1/public-listings/not-a-uuid/publish",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(dependencies.commands).toEqual([]);
  });

  it("does not disclose denied or cross-organization resources", async () => {
    const dependencies = createDependencies(false);
    const app = await buildApp(dependencies);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: "Bearer synthetic-token",
        "x-organization-id": organizationId,
      },
      method: "POST",
      url: `/api/v1/public-listings/${listingId}/withdraw`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
    expect(response.body).not.toContain("organization");
    expect(response.body).not.toContain("authorization");
  });
});

describe("anonymous public viewing requests", () => {
  const publicViewingRequests = createMemoryPublicViewingRequestGateway(
    new Set(["property_alpha_01"]),
  );

  it("accepts a validated inquiry without creating an application", async () => {
    const app = await buildApp({ publicViewingRequests });
    apps.push(app);

    const response = await app.inject({
      headers: { "x-request-id": "viewing-request-01" },
      method: "POST",
      payload: {
        email: "visitor@example.test",
        locale: "fr",
        name: "Visiteur Test",
        phone: "+243 000 000 000",
        preferredAt: "2026-10-02T10:00:00.000Z",
        propertyId: "property_alpha_01",
      },
      url: "/api/v1/viewing-requests",
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    publicRequestReceiptEnvelopeSchema.parse(body);
    expect(body).toEqual({
      data: { reference: "viewing-request-01", status: "accepted" },
      meta: { requestId: "viewing-request-01" },
    });
  });

  it("rejects a filled bot field and unknown public listing", async () => {
    const app = await buildApp({ publicViewingRequests });
    apps.push(app);

    const basePayload = {
      email: "visitor@example.test",
      name: "Visiteur Test",
      propertyId: "property_alpha_01",
    };
    const botResponse = await app.inject({
      method: "POST",
      payload: { ...basePayload, website: "https://automated.example.test" },
      url: "/api/v1/viewing-requests",
    });
    const missingResponse = await app.inject({
      method: "POST",
      payload: { ...basePayload, propertyId: "property_missing_99" },
      url: "/api/v1/viewing-requests",
    });

    expect(botResponse.statusCode).toBe(400);
    expect(botResponse.json().error.code).toBe("VALIDATION_ERROR");
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json().error.code).toBe("NOT_FOUND");
  });

  it("rate limits repeated inquiry writes with a stable error", async () => {
    const app = await buildApp({
      publicViewingRequests,
      viewingRequestRateLimitMax: 1,
    });
    apps.push(app);
    const payload = {
      email: "visitor@example.test",
      name: "Visiteur Test",
      propertyId: "property_alpha_01",
    };

    const accepted = await app.inject({
      method: "POST",
      payload,
      url: "/api/v1/viewing-requests",
    });
    const limited = await app.inject({
      method: "POST",
      payload: { ...payload, email: "rotated@example.test" },
      url: "/api/v1/viewing-requests",
    });

    expect(accepted.statusCode).toBe(202);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.json().error.code).toBe("RATE_LIMITED");
  });
});