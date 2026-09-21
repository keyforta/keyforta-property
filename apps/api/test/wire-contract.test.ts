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
  it("registers every implemented operation with its declared authentication", async () => {
    const app = await buildApp({
      authenticator: { async authenticate() { return undefined; } },
      landlordOnboarding: {
        async decide() { return undefined; },
        async list() { return []; },
        async submit() { return undefined; },
      },
      inventory: {
        async activateJurisdictionPolicy() { return undefined; },
        async setPropertyVerificationStatus() { return undefined; },
      },
      membershipLookup: {
        async lookupMemberships() { return []; },
      },
      publicListingPublication: {
        async listForActor() { return []; },
        async listPendingMediaReview() { return []; },
        async reviewPublicListingMedia() { return undefined; },
        async setPublication() { return false; },
      },
      rentalInventoryCommands: {
        async addRentalUnit() { return undefined; },
        async archiveRentalProperty() { return false; },
        async archiveRentalUnit() { return false; },
        async createPublicListing() { return undefined; },
        async createRentalProperty() { return undefined; },
        async listRentalProperties() { return []; },
        async setUnitAvailability() { return undefined; },
        async setUnitPricing() { return undefined; },
        async updatePublicListingDraft() { return undefined; },
      },
    });
    apps.push(app);

    for (const operation of Object.values(runtimeHttpOperations)) {
      const response = await app.inject({
        method: operation.method,
        url: runtimeUrl(operation.path),
      });

      const operationLabel = `${operation.method} ${operation.path}`;
      if (operation.authentication === "required") {
        expect(response.statusCode, operationLabel).toBe(401);
      } else {
        expect(response.statusCode, operationLabel).not.toBe(401);
        expect(response.statusCode, operationLabel).not.toBe(403);
        expect(response.statusCode, operationLabel).not.toBe(404);
      }
    }
  });
});
