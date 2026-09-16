import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createMemoryPublicPropertyGateway } from "../src/properties/gateway.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

const propertyRecords = [
  {
    address: "10 Market Street",
    city: "Kinshasa",
    createdAt: "2026-09-01T09:00:00.000Z",
    id: "property_alpha_01",
    imageUrl: "/images/property-alpha.jpg",
    name: "Alpha Residence",
    published: true,
    summary: "Synthetic public property fixture.",
  },
  {
    address: "20 River Road",
    city: "Kinshasa",
    createdAt: "2026-09-02T09:00:00.000Z",
    id: "property_bravo_02",
    name: "Bravo Court",
    published: true,
    summary: "Second synthetic public property fixture.",
  },
  {
    address: "30 Private Avenue",
    city: "Kinshasa",
    createdAt: "2026-09-03T09:00:00.000Z",
    id: "property_private_03",
    name: "Unpublished Property",
    published: false,
    summary: "This fixture must never leave the gateway.",
  },
] as const;

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("KEYFORTA API runtime", () => {
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
    expect(response.json()).toEqual({
      items: [
        {
          address: "10 Market Street",
          city: "Kinshasa",
          id: "property_alpha_01",
          imageUrl: "/images/property-alpha.jpg",
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
    expect(response.json()).toEqual({
      data: {
        address: "20 River Road",
        city: "Kinshasa",
        id: "property_bravo_02",
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
      city: "Kinshasa",
      id: "property_boundary_04",
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