import { afterEach, describe, expect, it } from "vitest";

import { apiBasePath, runtimeHttpOperations } from "@keyforta/contracts";

import { buildApp } from "../src/app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function runtimeUrl(path: string) {
  return `${apiBasePath}${path}`
    .replace("{propertyId}", "property_alpha_01")
    .replace("{listingId}", "00000000-0000-4000-8000-000000000930")
    .replace("{applicationId}", "00000000-0000-4000-8000-000000000801");
}

describe("OpenAPI runtime wire contract", () => {
  it("registers every implemented operation exported by shared contracts", async () => {
    const app = await buildApp();
    apps.push(app);

    for (const operation of Object.values(runtimeHttpOperations)) {
      const response = await app.inject({
        method: operation.method,
        url: runtimeUrl(operation.path),
      });

      expect(response.statusCode, `${operation.method} ${operation.path}`).not.toBe(404);
    }
  });
});
