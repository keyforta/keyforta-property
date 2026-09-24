import { createHash, randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  actorMembershipListEnvelopeSchema,
  addRentalUnitInputSchema,
  archiveRentalInventoryEnvelopeSchema,
  archiveRentalInventoryInputSchema,
  availabilityVersionCreationEnvelopeSchema,
  createRentalPropertyInputSchema,
  createPublicListingEnvelopeSchema,
  createPublicListingInputSchema,
  deletePublicListingImageEnvelopeSchema,
  jurisdictionPolicyActivationEnvelopeSchema,
  jurisdictionPolicyActivationInputSchema,
  landlordOnboardingApplicationIdSchema,
  landlordOnboardingApplicationInputSchema,
  landlordOnboardingApplicationListSchema,
  landlordOnboardingApplicationSchema,
  landlordOnboardingDecisionInputSchema,
  organizationIdSchema,
  pendingPublicListingMediaReviewListEnvelopeSchema,
  pricingVersionCreationEnvelopeSchema,
  propertyIdSchema,
  propertyVerificationStatusEnvelopeSchema,
  propertyVerificationStatusInputSchema,
  publicListingIdSchema,
  publicListingImageIdSchema,
  publicListingListEnvelopeSchema,
  publicListingMediaReviewEnvelopeSchema,
  publicListingMediaReviewInputSchema,
  publicListingImageListEnvelopeSchema,
  publicListingPhotoGalleryEnvelopeSchema,
  publicPropertyIdSchema,
  publicPropertyListQuerySchema,
  publicPropertyListResultSchema,
  publicPropertyProjectionSchema,
  publicRequestReceiptSchema,
  publicViewingRequestInputSchema,
  rentableUnitCreationEnvelopeSchema,
  rentalPropertyCreationEnvelopeSchema,
  rentalPropertyListEnvelopeSchema,
  setUnitAvailabilityInputSchema,
  setUnitPricingInputSchema,
  unitIdSchema,
  updatePublicListingDraftEnvelopeSchema,
  updatePublicListingDraftInputSchema,
  uploadPublicListingImageEnvelopeSchema,
  uploadPublicListingImageInputSchema,
} from "@keyforta/contracts";
import { canAccess } from "@keyforta/authorization";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import { registerApiDocs } from "./api-docs.js";
import type { Principal, PrincipalAuthenticator } from "./authentication.js";
import type { LandlordOnboardingGateway } from "./onboarding/gateway.js";
import {
  InvalidPublicPropertyCursorError,
  type PublicPropertyGateway,
} from "./properties/gateway.js";
import type { MembershipLookupGateway } from "./identity/membership-gateway.js";
import type { InventoryGateway } from "./properties/inventory-gateway.js";
import {
  RentalInventoryAuthorizationError,
  RentalInventoryConflictError,
  RentalInventoryNotFoundError,
  type RentalInventoryCommandGateway,
} from "./properties/inventory-command-gateway.js";
import type { PublicListingPublicationGateway } from "./properties/publication-gateway.js";
import type { PublicListingMediaGateway } from "./properties/media-gateway.js";
import type { MediaScanner } from "./media/scanner.js";
import { NoopScanner } from "./media/scanner.js";
import type { PublicViewingRequestGateway } from "./properties/viewing-gateway.js";

const serviceName = "keyforta-api";
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// Node's Buffer.from(value, "base64") never throws: it silently ignores
// characters outside the base64 alphabet instead of rejecting malformed
// input, so a catch block around it is dead code. This pattern enforces
// strict RFC 4648 base64 (correct alphabet, grouping, and padding) before
// any decode is attempted, matching REQ-038's requirement that a rejected
// upload never reaches the scanner or database with garbage bytes.
const strictBase64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface AppDependencies {
  apiDocs?: boolean;
  authenticator?: PrincipalAuthenticator;
  corsOrigin?: string | string[] | boolean;
  landlordOnboarding?: LandlordOnboardingGateway;
  landlordOnboardingRateLimitMax?: number;
  inventory?: InventoryGateway;
  membershipLookup?: MembershipLookupGateway;
  mediaScanner?: MediaScanner;
  platformAdminObjectIds?: ReadonlySet<string>;
  publicListingMedia?: PublicListingMediaGateway;
  publicListingPublication?: PublicListingPublicationGateway;
  publicProperties?: PublicPropertyGateway;
  publicViewingRequests?: PublicViewingRequestGateway;
  readiness?: () => Promise<void>;
  rentalInventoryCommands?: RentalInventoryCommandGateway;
  useAuthorizationModule?: boolean;
  viewingRequestRateLimitMax?: number;
}

export function parseCorsOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const origins = value.split(",").map((candidate) => candidate.trim());
  if (origins.some((candidate) => !candidate)) {
    throw new Error("CORS_ALLOWED_ORIGIN contains an empty origin.");
  }
  for (const origin of origins) {
    const url = new URL(origin);
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    if (
      url.origin !== origin ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    ) {
      throw new Error("CORS_ALLOWED_ORIGIN contains an invalid origin.");
    }
  }
  return [...new Set(origins)];
}

async function authenticate(
  authorization: string | undefined,
  authenticator: PrincipalAuthenticator | undefined,
): Promise<Principal | undefined> {
  if (!authorization?.match(/^Bearer\s+\S+$/) || !authenticator) return undefined;
  try {
    return await authenticator.authenticate(authorization);
  } catch {
    return undefined;
  }
}

/**
 * Decide whether an authenticated principal may perform a platform-admin
 * onboarding-review action. Platform administrators are identity-scoped
 * (cross-organization by design, per ADR-002), so the trusted membership
 * fact this route resolves is simply "this object ID is on the configured
 * platform-admin allowlist." That fact is fed into the shared authorization
 * module so every protected route evaluates decisions through one policy
 * engine instead of ad hoc checks scattered across routes.
 *
 * `useAuthorizationModule` defaults to enabled. It stays available as an
 * explicit rollback switch: set it to `false` to fall back to the legacy
 * allowlist-only check while a regression is investigated, without a code
 * deploy.
 */
export function isAuthorizedPlatformAdminAction(
  principal: Principal,
  action: string,
  dependencies: Pick<AppDependencies, "platformAdminObjectIds" | "useAuthorizationModule">,
): boolean {
  const isAllowlisted = Boolean(dependencies.platformAdminObjectIds?.has(principal.objectId));
  if (dependencies.useAuthorizationModule === false) {
    return isAllowlisted;
  }
  return canAccess({
    action,
    identity: { objectId: principal.objectId },
    role: isAllowlisted ? "platform_admin" : "unauthenticated",
  });
}

function problem(
  requestId: string,
  status: number,
  code: string,
  title: string,
  detail: string,
  details: unknown = {},
) {
  return {
    error: {
      code,
      details,
      message: detail,
      traceId: requestId,
    },
  };
}

function toPublicProjection(candidate: unknown) {
  const parsed = publicPropertyProjectionSchema.parse(candidate);
  return { ...parsed, address: parsed.district };
}

export async function buildApp(
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  const mediaScanner: MediaScanner = dependencies.mediaScanner ?? new NoopScanner();
  const configuredCorsOrigin =
    dependencies.corsOrigin ??
    (process.env.NODE_ENV === "production" ? false : true);
  const app = Fastify({
    bodyLimit: 16 * 1024,
    frameworkErrors: (_error, request, reply) => {
      const payload = JSON.stringify(
        problem(
          request.id,
          400,
          "VALIDATION_ERROR",
          "Validation Error",
          "The request URL is invalid.",
        ),
      );
      reply.raw.statusCode = 400;
      reply.raw.setHeader("content-type", "application/json; charset=utf-8");
      reply.raw.setHeader("x-request-id", request.id);
      reply.raw.end(payload);
    },
    genReqId: (request) => {
      const suppliedRequestId = request.headers["x-request-id"];
      return typeof suppliedRequestId === "string" &&
        requestIdPattern.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    },
    logger: process.env.NODE_ENV !== "test",
    requestTimeout: 30_000,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 429
    ) {
      return reply
        .status(429)
        .send(
          problem(
            request.id,
            429,
            "RATE_LIMITED",
            "Too Many Requests",
            "Too many viewing requests were submitted. Try again later.",
          ),
        );
    }
    request.log.error({ requestId: request.id }, "Unhandled request error");
    return reply
      .status(500)
      .send(
        problem(
          request.id,
          500,
          "INTERNAL_SERVER_ERROR",
          "Internal Server Error",
          "An unexpected error occurred.",
        ),
      );
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(
        problem(
          request.id,
          404,
          "NOT_FOUND",
          "Not Found",
          "The requested resource was not found.",
        ),
      ),
  );

  await app.register(helmet);
  if (dependencies.apiDocs) {
    await registerApiDocs(app);
  }
  await app.register(rateLimit, {
    global: false,
  });
  await app.register(cors, {
    credentials: false,
    origin:
      typeof configuredCorsOrigin === "string"
        ? (origin, callback) =>
            callback(null, origin === configuredCorsOrigin)
        : configuredCorsOrigin,
  });

  app.get("/health", async (request) => ({
    meta: { requestId: request.id },
    service: serviceName,
    status: "ok",
  }));

  app.get("/ready", async (request, reply) => {
    try {
      if (!dependencies.publicProperties) {
        throw new Error("Required public property gateway is unavailable.");
      }
      await dependencies.readiness?.();
      return reply.send({
        meta: { requestId: request.id },
        service: serviceName,
        status: "ready",
      });
    } catch (error) {
      request.log.warn({ requestId: request.id }, "Readiness check failed");
      return reply.status(503).send({
        code: "DEPENDENCY_UNAVAILABLE",
        service: serviceName,
        status: "not_ready",
        traceId: request.id,
      });
    }
  });

  app.get("/api/v1/properties", async (request, reply) => {
    if (!dependencies.publicProperties) {
      return reply
        .status(503)
        .send(
          problem(
            request.id,
            503,
            "DEPENDENCY_UNAVAILABLE",
            "Service Unavailable",
            "Property discovery is temporarily unavailable.",
          ),
        );
    }

    const parsedQuery = publicPropertyListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply
        .status(400)
        .send(
          problem(
            request.id,
            400,
            "VALIDATION_ERROR",
            "Validation Error",
            "The request query is invalid.",
            parsedQuery.error.flatten(),
          ),
        );
    }

    try {
      const result = await dependencies.publicProperties.list(parsedQuery.data);
      const parsedResult = publicPropertyListResultSchema.parse(result);
      return reply.send({
        ...parsedResult,
        items: parsedResult.items.map(toPublicProjection),
        meta: { requestId: request.id },
      });
    } catch (error) {
      if (error instanceof InvalidPublicPropertyCursorError) {
        return reply
          .status(400)
          .send(
            problem(
              request.id,
              400,
              "VALIDATION_ERROR",
              "Validation Error",
              "The pagination cursor is invalid.",
            ),
          );
      }
      throw error;
    }
  });

  app.get<{ Params: { propertyId: string } }>(
    "/api/v1/properties/:propertyId",
    async (request, reply) => {
      if (!dependencies.publicProperties) {
        return reply
          .status(503)
          .send(
            problem(
              request.id,
              503,
              "DEPENDENCY_UNAVAILABLE",
              "Service Unavailable",
              "Property discovery is temporarily unavailable.",
            ),
          );
      }

      const parsedPropertyId = publicPropertyIdSchema.safeParse(
        request.params.propertyId,
      );
      if (!parsedPropertyId.success) {
        return reply
          .status(400)
          .send(
            problem(
              request.id,
              400,
              "VALIDATION_ERROR",
              "Validation Error",
              "The property ID is invalid.",
              parsedPropertyId.error.flatten(),
            ),
          );
      }

      const property = await dependencies.publicProperties.findById(
        parsedPropertyId.data,
      );
      return property
        ? reply.send({
            data: toPublicProjection(property),
            meta: { requestId: request.id },
          })
        : reply
            .status(404)
            .send(
              problem(
                request.id,
                404,
                "NOT_FOUND",
                "Not Found",
                "The requested property was not found.",
              ),
            );
    },
  );

  const registerPublicationCommand = (
    command: "publish" | "withdraw",
    published: boolean,
  ) => {
    app.post<{ Params: { listingId: string } }>(
      `/api/v1/public-listings/:listingId/${command}`,
      async (request, reply) => {
        if (!dependencies.authenticator || !dependencies.publicListingPublication) {
          return reply.status(503).send(problem(
            request.id,
            503,
            "DEPENDENCY_UNAVAILABLE",
            "Service Unavailable",
            "Listing publication is temporarily unavailable.",
          ));
        }

        const authorization = request.headers.authorization;
        if (!authorization?.match(/^Bearer\s+\S+$/)) {
          return reply.status(401).send(problem(
            request.id,
            401,
            "UNAUTHENTICATED",
            "Unauthorized",
            "A valid bearer credential is required.",
          ));
        }

        let principal;
        try {
          principal = await dependencies.authenticator.authenticate(authorization);
        } catch {
          principal = undefined;
        }
        if (!principal?.subject.trim()) {
          return reply.status(401).send(problem(
            request.id,
            401,
            "UNAUTHENTICATED",
            "Unauthorized",
            "A valid bearer credential is required.",
          ));
        }

        const parsedOrganizationId = organizationIdSchema.safeParse(
          request.headers["x-organization-id"],
        );
        const parsedListingId = publicListingIdSchema.safeParse(
          request.params.listingId,
        );
        if (!parsedOrganizationId.success || !parsedListingId.success) {
          return reply.status(400).send(problem(
            request.id,
            400,
            "VALIDATION_ERROR",
            "Validation Error",
            "The organization or listing ID is invalid.",
          ));
        }

        const changed = await dependencies.publicListingPublication.setPublication({
          correlationId: request.id,
          listingId: parsedListingId.data,
          organizationId: parsedOrganizationId.data,
          published,
          subject: principal.subject,
        });
        if (!changed) {
          return reply.status(404).send(problem(
            request.id,
            404,
            "NOT_FOUND",
            "Not Found",
            "The requested listing was not found.",
          ));
        }

        return reply.send({
          data: {
            listingId: parsedListingId.data,
            status: published ? "published" : "withdrawn",
          },
          meta: { requestId: request.id },
        });
      },
    );
  };

  registerPublicationCommand("publish", true);
  registerPublicationCommand("withdraw", false);

  app.post(
    "/api/v1/admin/jurisdiction-policies/activate",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.inventory) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Jurisdiction policy activation is temporarily unavailable.",
        ));
      }
      const principal = await authenticate(
        request.headers.authorization,
        dependencies.authenticator,
      );
      if (!principal) {
        return reply.status(401).send(problem(
          request.id, 401, "UNAUTHENTICATED", "Unauthorized",
          "A valid bearer credential is required.",
        ));
      }
      if (!isAuthorizedPlatformAdminAction(principal, "platform_operations_with_audit", dependencies)) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      const parsedInput = jurisdictionPolicyActivationInputSchema.safeParse(request.body);
      if (!parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The jurisdiction policy activation is invalid.",
          parsedInput.error.flatten(),
        ));
      }
      const activated = await dependencies.inventory.activateJurisdictionPolicy({
        ...parsedInput.data,
        correlationId: request.id,
        subject: principal.subject,
      });
      if (!activated) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      return reply.status(201).send(
        jurisdictionPolicyActivationEnvelopeSchema.parse({
          data: activated,
          meta: { requestId: request.id },
        }),
      );
    },
  );

  app.patch<{ Params: { propertyId: string } }>(
    "/api/v1/properties/:propertyId/verification-status",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.inventory) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Property verification is temporarily unavailable.",
        ));
      }
      const principal = await authenticate(
        request.headers.authorization,
        dependencies.authenticator,
      );
      if (!principal) {
        return reply.status(401).send(problem(
          request.id, 401, "UNAUTHENTICATED", "Unauthorized",
          "A valid bearer credential is required.",
        ));
      }
      if (!isAuthorizedPlatformAdminAction(principal, "platform_operations_with_audit", dependencies)) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      const parsedPropertyId = propertyIdSchema.safeParse(request.params.propertyId);
      const parsedInput = propertyVerificationStatusInputSchema.safeParse(request.body);
      if (!parsedPropertyId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The property verification update is invalid.",
        ));
      }
      const updated = await dependencies.inventory.setPropertyVerificationStatus({
        correlationId: request.id,
        propertyId: parsedPropertyId.data,
        status: parsedInput.data.status,
        subject: principal.subject,
      });
      if (!updated) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      return reply.send(
        propertyVerificationStatusEnvelopeSchema.parse({
          data: updated,
          meta: { requestId: request.id },
        }),
      );
    },
  );

  // Rental Property and Unit lifecycle (REQ-032, REQ-033, REQ-034, REQ-036).
  // PublicListing creation, editing, and media review (REQ-037) are
  // registered further below, alongside the existing publish/withdraw and
  // portfolio-feed routes.
  const authenticateOrganizationRequest = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const principal = await authenticate(
      request.headers.authorization,
      dependencies.authenticator,
    );
    if (!principal) {
      reply.status(401).send(problem(
        request.id, 401, "UNAUTHENTICATED", "Unauthorized",
        "A valid bearer credential is required.",
      ));
      return undefined;
    }
    const parsedOrganizationId = organizationIdSchema.safeParse(
      request.headers["x-organization-id"],
    );
    if (!parsedOrganizationId.success) {
      reply.status(400).send(problem(
        request.id, 400, "VALIDATION_ERROR", "Validation Error",
        "The organization ID is invalid.",
      ));
      return undefined;
    }
    return { organizationId: parsedOrganizationId.data, principal };
  };

  const handleRentalInventoryError = (
    error: unknown,
    request: { id: string },
    reply: { status(code: number): { send(body: unknown): unknown } },
  ) => {
    if (error instanceof RentalInventoryAuthorizationError) {
      return reply.status(404).send(problem(
        request.id, 404, "NOT_FOUND", "Not Found",
        "The requested resource was not found.",
      ));
    }
    if (error instanceof RentalInventoryNotFoundError) {
      return reply.status(404).send(problem(
        request.id, 404, "NOT_FOUND", "Not Found",
        "The requested resource was not found.",
      ));
    }
    if (error instanceof RentalInventoryConflictError) {
      return reply.status(409).send(problem(
        request.id, 409, "CONFLICT", "Conflict", error.message,
      ));
    }
    throw error;
  };

  app.post("/api/v1/properties", async (request, reply) => {
    if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
      return reply.status(503).send(problem(
        request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
        "Rental property creation is temporarily unavailable.",
      ));
    }
    const context = await authenticateOrganizationRequest(request, reply);
    if (!context) return undefined;
    const parsedInput = createRentalPropertyInputSchema.safeParse(request.body);
    if (!parsedInput.success) {
      return reply.status(400).send(problem(
        request.id, 400, "VALIDATION_ERROR", "Validation Error",
        "The Property is invalid.", parsedInput.error.flatten(),
      ));
    }
    try {
      const created = await dependencies.rentalInventoryCommands.createRentalProperty({
        address: parsedInput.data.address,
        correlationId: request.id,
        firstUnit: parsedInput.data.firstUnit,
        idempotencyKey: parsedInput.data.idempotencyKey,
        jurisdictionCode: parsedInput.data.jurisdictionCode ?? null,
        name: parsedInput.data.name,
        organizationId: context.organizationId,
        propertyType: parsedInput.data.propertyType,
        source: "runtime_api",
        subject: context.principal.subject,
        timeZone: parsedInput.data.timeZone,
      });
      if (!created) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      return reply.status(201).send(
        rentalPropertyCreationEnvelopeSchema.parse({
          data: created,
          meta: { requestId: request.id },
        }),
      );
    } catch (error) {
      return handleRentalInventoryError(error, request, reply);
    }
  });

  app.get("/api/v1/properties/mine", async (request, reply) => {
    if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
      return reply.status(503).send(problem(
        request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
        "Rental property listing is temporarily unavailable.",
      ));
    }
    const context = await authenticateOrganizationRequest(request, reply);
    if (!context) return undefined;
    try {
      const items = await dependencies.rentalInventoryCommands.listRentalProperties({
        correlationId: request.id,
        organizationId: context.organizationId,
        subject: context.principal.subject,
      });
      return reply.send(
        rentalPropertyListEnvelopeSchema.parse({
          items,
          meta: { requestId: request.id },
        }),
      );
    } catch (error) {
      return handleRentalInventoryError(error, request, reply);
    }
  });

  // REQ-035 / issue #114: read-only feed of the actor's own manageable
  // PublicListings — assignment-scoped for every actor, including landlords,
  // matching app.set_public_listing_publication (0023)'s authorization model
  // exactly (organization ownership alone does not grant listing-publication
  // authority). This lets the portal offer a picker instead of a manual
  // listing-ID text field. This does not create or mutate listings.
  app.get("/api/v1/public-listings/mine", async (request, reply) => {
    if (!dependencies.authenticator || !dependencies.publicListingPublication) {
      return reply.status(503).send(problem(
        request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
        "Listing publication is temporarily unavailable.",
      ));
    }
    const context = await authenticateOrganizationRequest(request, reply);
    if (!context) return undefined;
    try {
      const items = await dependencies.publicListingPublication.listForActor({
        correlationId: request.id,
        organizationId: context.organizationId,
        subject: context.principal.subject,
      });
      return reply.send(
        publicListingListEnvelopeSchema.parse({
          items,
          meta: { requestId: request.id },
        }),
      );
    } catch (error) {
      return handleRentalInventoryError(error, request, reply);
    }
  });

  app.post<{ Params: { propertyId: string } }>(
    "/api/v1/properties/:propertyId/units",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Unit creation is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedPropertyId = propertyIdSchema.safeParse(request.params.propertyId);
      const parsedInput = addRentalUnitInputSchema.safeParse(request.body);
      if (!parsedPropertyId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The Unit is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      try {
        const { idempotencyKey, ...unit } = parsedInput.data;
        const created = await dependencies.rentalInventoryCommands.addRentalUnit({
          correlationId: request.id,
          idempotencyKey,
          organizationId: context.organizationId,
          propertyId: parsedPropertyId.data,
          source: "runtime_api",
          subject: context.principal.subject,
          unit,
        });
        if (!created) {
          return reply.status(404).send(problem(
            request.id, 404, "NOT_FOUND", "Not Found",
            "The requested resource was not found.",
          ));
        }
        return reply.status(201).send(
          rentableUnitCreationEnvelopeSchema.parse({
            data: created,
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  app.patch<{ Params: { unitId: string } }>(
    "/api/v1/units/:unitId/pricing",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Unit pricing is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedUnitId = unitIdSchema.safeParse(request.params.unitId);
      const parsedInput = setUnitPricingInputSchema.safeParse(request.body);
      if (!parsedUnitId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The pricing change is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      try {
        const created = await dependencies.rentalInventoryCommands.setUnitPricing({
          amountMinor: parsedInput.data.amountMinor,
          correlationId: request.id,
          currency: parsedInput.data.currency,
          effectiveFrom: parsedInput.data.effectiveFrom,
          expectedVersion: parsedInput.data.expectedVersion,
          idempotencyKey: parsedInput.data.idempotencyKey,
          organizationId: context.organizationId,
          source: "runtime_api",
          subject: context.principal.subject,
          unitId: parsedUnitId.data,
        });
        if (!created) {
          return reply.status(404).send(problem(
            request.id, 404, "NOT_FOUND", "Not Found",
            "The requested resource was not found.",
          ));
        }
        return reply.status(200).send(
          pricingVersionCreationEnvelopeSchema.parse({
            data: created,
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  app.patch<{ Params: { unitId: string } }>(
    "/api/v1/units/:unitId/availability",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Unit availability is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedUnitId = unitIdSchema.safeParse(request.params.unitId);
      const parsedInput = setUnitAvailabilityInputSchema.safeParse(request.body);
      if (!parsedUnitId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The availability change is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      try {
        const created = await dependencies.rentalInventoryCommands.setUnitAvailability({
          correlationId: request.id,
          effectiveFrom: parsedInput.data.effectiveFrom,
          expectedVersion: parsedInput.data.expectedVersion,
          idempotencyKey: parsedInput.data.idempotencyKey,
          organizationId: context.organizationId,
          reasonCode: parsedInput.data.reasonCode ?? null,
          source: "runtime_api",
          status: parsedInput.data.status,
          subject: context.principal.subject,
          unitId: parsedUnitId.data,
        });
        if (!created) {
          return reply.status(404).send(problem(
            request.id, 404, "NOT_FOUND", "Not Found",
            "The requested resource was not found.",
          ));
        }
        return reply.status(200).send(
          availabilityVersionCreationEnvelopeSchema.parse({
            data: created,
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  app.post<{ Params: { unitId: string } }>(
    "/api/v1/units/:unitId/public-listing",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "PublicListing creation is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedUnitId = unitIdSchema.safeParse(request.params.unitId);
      const parsedInput = createPublicListingInputSchema.safeParse(request.body);
      if (!parsedUnitId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The PublicListing is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      try {
        const created = await dependencies.rentalInventoryCommands.createPublicListing({
          attestationAccepted: parsedInput.data.attestationAccepted,
          correlationId: request.id,
          idempotencyKey: parsedInput.data.idempotencyKey,
          imageUrls: parsedInput.data.imageUrls,
          organizationId: context.organizationId,
          source: "runtime_api",
          subject: context.principal.subject,
          summary: parsedInput.data.summary,
          title: parsedInput.data.title,
          unitId: parsedUnitId.data,
        });
        if (!created) {
          return reply.status(404).send(problem(
            request.id, 404, "NOT_FOUND", "Not Found",
            "The requested resource was not found.",
          ));
        }
        return reply.status(201).send(
          createPublicListingEnvelopeSchema.parse({
            data: created,
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  app.patch<{ Params: { listingId: string } }>(
    "/api/v1/public-listings/:listingId/draft",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "PublicListing editing is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedListingId = publicListingIdSchema.safeParse(request.params.listingId);
      const parsedInput = updatePublicListingDraftInputSchema.safeParse(request.body);
      if (!parsedListingId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The PublicListing draft update is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      try {
        const updated = await dependencies.rentalInventoryCommands.updatePublicListingDraft({
          correlationId: request.id,
          expectedVersion: parsedInput.data.expectedVersion,
          imageUrls: parsedInput.data.imageUrls,
          listingId: parsedListingId.data,
          organizationId: context.organizationId,
          source: "runtime_api",
          subject: context.principal.subject,
          summary: parsedInput.data.summary,
          title: parsedInput.data.title,
        });
        if (!updated) {
          return reply.status(404).send(problem(
            request.id, 404, "NOT_FOUND", "Not Found",
            "The requested resource was not found.",
          ));
        }
        return reply.status(200).send(
          updatePublicListingDraftEnvelopeSchema.parse({
            data: updated,
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  // REQ-038 uploaded listing media (upload/list/delete + public scan-gated
  // serving). `uploadPublicListingImageInputSchema` requires
  // `attestationAccepted: true` (PROP-028: the image-rights and consent
  // attestation checkbox must be affirmatively checked before any upload is
  // accepted); the safeParse below rejects with 400 before any database
  // call or malware scan when it is missing or not `true`. Malware
  // scanning happens here, before any database call, so a failed scan
  // never persists a partial row (PROP-028).
  app.post<{ Params: { listingId: string } }>(
    "/api/v1/public-listings/:listingId/images",
    { bodyLimit: 14 * 1024 * 1024 },
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.publicListingMedia) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "PublicListing image upload is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedListingId = publicListingIdSchema.safeParse(request.params.listingId);
      const parsedInput = uploadPublicListingImageInputSchema.safeParse(request.body);
      if (!parsedListingId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The image upload is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      if (!strictBase64Pattern.test(parsedInput.data.contentBase64)) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The image content is not valid base64.",
        ));
      }
      // Authorization precheck before the expensive decode/scan below
      // (Copilot review finding on PR #131: without this, an
      // authenticated-but-unauthorized actor could repeatedly trigger the
      // malware scan just to be rejected afterward by the upload function).
      const canUpload = await dependencies.publicListingMedia.canActorUploadImage({
        listingId: parsedListingId.data,
        organizationId: context.organizationId,
        subject: context.principal.subject,
      });
      if (!canUpload) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      const content = Buffer.from(parsedInput.data.contentBase64, "base64");
      if (content.length < 1 || content.length > 10_485_760) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "An uploaded image must be between 1 byte and 10 MB.",
        ));
      }
      const scanResult = await mediaScanner.scanUpload(content, parsedInput.data.mediaType);
      if (!scanResult.clean) {
        return reply.status(422).send(problem(
          request.id, 422, "MEDIA_SCAN_REJECTED", "Unprocessable Entity",
          "The uploaded image failed malware scanning and was not stored.",
        ));
      }
      const contentHash = createHash("sha256").update(content).digest("hex");
      try {
        const uploaded = await dependencies.publicListingMedia.uploadImage({
          content,
          contentHash,
          correlationId: request.id,
          listingId: parsedListingId.data,
          mediaType: parsedInput.data.mediaType,
          organizationId: context.organizationId,
          room: parsedInput.data.room,
          sizeBytes: content.length,
          source: "runtime_api",
          subject: context.principal.subject,
        });
        if (!uploaded) {
          return reply.status(404).send(problem(
            request.id, 404, "NOT_FOUND", "Not Found",
            "The requested resource was not found.",
          ));
        }
        return reply.status(201).send(
          uploadPublicListingImageEnvelopeSchema.parse({
            data: uploaded,
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  app.get<{ Params: { listingId: string } }>(
    "/api/v1/public-listings/:listingId/images",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.publicListingMedia) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "PublicListing image listing is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedListingId = publicListingIdSchema.safeParse(request.params.listingId);
      if (!parsedListingId.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The listing ID is invalid.",
        ));
      }
      try {
        const items = await dependencies.publicListingMedia.listImages({
          listingId: parsedListingId.data,
          organizationId: context.organizationId,
          subject: context.principal.subject,
        });
        return reply.status(200).send(
          publicListingImageListEnvelopeSchema.parse({
            items,
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  app.delete<{ Params: { listingId: string; imageId: string } }>(
    "/api/v1/public-listings/:listingId/images/:imageId",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.publicListingMedia) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "PublicListing image deletion is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedListingId = publicListingIdSchema.safeParse(request.params.listingId);
      const parsedImageId = publicListingImageIdSchema.safeParse(request.params.imageId);
      if (!parsedListingId.success || !parsedImageId.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The listing or image ID is invalid.",
        ));
      }
      try {
        const deleted = await dependencies.publicListingMedia.deleteImage({
          correlationId: request.id,
          imageId: parsedImageId.data,
          listingId: parsedListingId.data,
          organizationId: context.organizationId,
          source: "runtime_api",
          subject: context.principal.subject,
        });
        if (!deleted) {
          return reply.status(404).send(problem(
            request.id, 404, "NOT_FOUND", "Not Found",
            "The requested resource was not found.",
          ));
        }
        return reply.status(200).send(
          deletePublicListingImageEnvelopeSchema.parse({
            data: deleted,
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  // PROP-031: public, scan-gated photo gallery grouped by room. Anonymous
  // (no bearer credential required, matching /api/v1/properties/:propertyId).
  app.get<{ Params: { listingId: string } }>(
    "/api/v1/public-listings/:listingId/photos",
    async (request, reply) => {
      if (!dependencies.publicListingMedia) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "PublicListing photo gallery is temporarily unavailable.",
        ));
      }
      const parsedListingId = publicListingIdSchema.safeParse(request.params.listingId);
      if (!parsedListingId.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The listing ID is invalid.",
        ));
      }
      const images = await dependencies.publicListingMedia.listPublicImagesByRoom(
        parsedListingId.data,
      );
      if (images.length === 0) {
        // Distinguishing "listing exists but has no photos" from "listing
        // is not published/eligible" would leak publication state to an
        // anonymous caller, so both cases return the same 404 (nondisclosing
        // denial, matching PROP-010/PROP-024's model applied here to public
        // read access).
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      const toPhoto = (image: { imageId: string; room: string }) => ({
        imageId: image.imageId,
        room: image.room,
        url: `/api/v1/public-listings/${parsedListingId.data}/images/${image.imageId}/content`,
      });
      const roomsInOrder: string[] = [];
      for (const image of images) {
        if (!roomsInOrder.includes(image.room)) roomsInOrder.push(image.room);
      }
      return reply.status(200).send(
        publicListingPhotoGalleryEnvelopeSchema.parse({
          data: {
            allPhotos: images.map(toPhoto),
            rooms: roomsInOrder.map((room) => ({
              photos: images.filter((image) => image.room === room).map(toPhoto),
              room,
            })),
          },
          meta: { requestId: request.id },
        }),
      );
    },
  );

  // Serves the raw bytes for one photo of a published, eligible listing
  // only (decision 6): never a raw/directly link-shareable storage URL.
  app.get<{ Params: { listingId: string; imageId: string } }>(
    "/api/v1/public-listings/:listingId/images/:imageId/content",
    async (request, reply) => {
      if (!dependencies.publicListingMedia) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "PublicListing image serving is temporarily unavailable.",
        ));
      }
      const parsedListingId = publicListingIdSchema.safeParse(request.params.listingId);
      const parsedImageId = publicListingImageIdSchema.safeParse(request.params.imageId);
      if (!parsedListingId.success || !parsedImageId.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The listing or image ID is invalid.",
        ));
      }
      const content = await dependencies.publicListingMedia.getPublicImageContent(
        parsedListingId.data,
        parsedImageId.data,
      );
      if (!content) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      return reply
        .status(200)
        .header("content-type", content.mediaType)
        .send(content.content);
    },
  );

  app.delete<{ Params: { unitId: string } }>(
    "/api/v1/units/:unitId",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Unit archive is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedUnitId = unitIdSchema.safeParse(request.params.unitId);
      const parsedInput = archiveRentalInventoryInputSchema.safeParse(request.body);
      if (!parsedUnitId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The archive request is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      try {
        const archived = await dependencies.rentalInventoryCommands.archiveRentalUnit({
          correlationId: request.id,
          expectedVersion: parsedInput.data.expectedVersion,
          idempotencyKey: parsedInput.data.idempotencyKey,
          organizationId: context.organizationId,
          reason: parsedInput.data.reason,
          source: "runtime_api",
          subject: context.principal.subject,
          unitId: parsedUnitId.data,
        });
        if (!archived) {
          return reply.status(409).send(problem(
            request.id, 409, "CONFLICT", "Conflict",
            "The Unit cannot be archived in its current state.",
          ));
        }
        return reply.send(
          archiveRentalInventoryEnvelopeSchema.parse({
            data: { archived: true },
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  app.delete<{ Params: { propertyId: string } }>(
    "/api/v1/properties/:propertyId",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.rentalInventoryCommands) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Property archive is temporarily unavailable.",
        ));
      }
      const context = await authenticateOrganizationRequest(request, reply);
      if (!context) return undefined;
      const parsedPropertyId = propertyIdSchema.safeParse(request.params.propertyId);
      const parsedInput = archiveRentalInventoryInputSchema.safeParse(request.body);
      if (!parsedPropertyId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The archive request is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      try {
        const archived = await dependencies.rentalInventoryCommands.archiveRentalProperty({
          correlationId: request.id,
          expectedVersion: parsedInput.data.expectedVersion,
          idempotencyKey: parsedInput.data.idempotencyKey,
          organizationId: context.organizationId,
          propertyId: parsedPropertyId.data,
          reason: parsedInput.data.reason,
          source: "runtime_api",
          subject: context.principal.subject,
        });
        if (!archived) {
          return reply.status(409).send(problem(
            request.id, 409, "CONFLICT", "Conflict",
            "The Property cannot be archived in its current state.",
          ));
        }
        return reply.send(
          archiveRentalInventoryEnvelopeSchema.parse({
            data: { archived: true },
            meta: { requestId: request.id },
          }),
        );
      } catch (error) {
        return handleRentalInventoryError(error, request, reply);
      }
    },
  );

  app.get("/api/v1/session/memberships", async (request, reply) => {
    if (!dependencies.authenticator || !dependencies.membershipLookup) {
      return reply.status(503).send(problem(
        request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
        "Session membership lookup is temporarily unavailable.",
      ));
    }
    const principal = await authenticate(
      request.headers.authorization,
      dependencies.authenticator,
    );
    if (!principal) {
      return reply.status(401).send(problem(
        request.id, 401, "UNAUTHENTICATED", "Unauthorized",
        "A valid bearer credential is required.",
      ));
    }
    // Membership resolution is server-side only: the authenticated subject
    // is the sole input, never a client-supplied organization id, so a
    // caller cannot claim access to an organization it does not belong to.
    const memberships = await dependencies.membershipLookup.lookupMemberships({
      subject: principal.subject,
    });
    return reply.send(
      actorMembershipListEnvelopeSchema.parse({
        data: memberships,
        meta: { requestId: request.id },
      }),
    );
  });

  app.post(
    "/api/v1/landlord-onboarding-applications",
    {
      config: {
        rateLimit: {
          max: dependencies.landlordOnboardingRateLimitMax ?? 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.landlordOnboarding) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Landlord onboarding is temporarily unavailable.",
        ));
      }
      const principal = await authenticate(
        request.headers.authorization,
        dependencies.authenticator,
      );
      if (!principal) {
        return reply.status(401).send(problem(
          request.id, 401, "UNAUTHENTICATED", "Unauthorized",
          "A valid bearer credential is required.",
        ));
      }
      const parsedInput = landlordOnboardingApplicationInputSchema.safeParse(request.body);
      if (!parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The landlord onboarding application is invalid.",
          parsedInput.error.flatten(),
        ));
      }
      const application = await dependencies.landlordOnboarding.submit({
        ...parsedInput.data,
        applicantObjectId: principal.objectId,
        applicantSubject: principal.subject,
        correlationId: request.id,
      });
      if (!application) {
        return reply.status(409).send(problem(
          request.id, 409, "PENDING_APPLICATION_EXISTS", "Conflict",
          "A pending landlord onboarding application already exists.",
        ));
      }
      return reply.status(201).send({
        data: landlordOnboardingApplicationSchema.parse(application),
        meta: { requestId: request.id },
      });
    },
  );

  app.get("/api/v1/landlord-onboarding-applications", async (request, reply) => {
    if (!dependencies.authenticator || !dependencies.landlordOnboarding) {
      return reply.status(503).send(problem(
        request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
        "Landlord onboarding review is temporarily unavailable.",
      ));
    }
    const principal = await authenticate(
      request.headers.authorization,
      dependencies.authenticator,
    );
    if (!principal) {
      return reply.status(401).send(problem(
        request.id, 401, "UNAUTHENTICATED", "Unauthorized",
        "A valid bearer credential is required.",
      ));
    }
    if (!isAuthorizedPlatformAdminAction(principal, "review_onboarding_applications", dependencies)) {
      return reply.status(404).send(problem(
        request.id, 404, "NOT_FOUND", "Not Found",
        "The requested resource was not found.",
      ));
    }
    const applications = await dependencies.landlordOnboarding.list();
    const result = landlordOnboardingApplicationListSchema.parse({ items: applications });
    return reply.send({ ...result, meta: { requestId: request.id } });
  });

  app.post<{ Params: { applicationId: string } }>(
    "/api/v1/landlord-onboarding-applications/:applicationId/decision",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.landlordOnboarding) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Landlord onboarding review is temporarily unavailable.",
        ));
      }
      const principal = await authenticate(
        request.headers.authorization,
        dependencies.authenticator,
      );
      if (!principal) {
        return reply.status(401).send(problem(
          request.id, 401, "UNAUTHENTICATED", "Unauthorized",
          "A valid bearer credential is required.",
        ));
      }
      if (!isAuthorizedPlatformAdminAction(principal, "decide_onboarding_applications", dependencies)) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      const parsedApplicationId = landlordOnboardingApplicationIdSchema.safeParse(
        request.params.applicationId,
      );
      const parsedInput = landlordOnboardingDecisionInputSchema.safeParse(request.body);
      if (!parsedApplicationId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The landlord onboarding decision is invalid.",
        ));
      }
      const application = await dependencies.landlordOnboarding.decide({
        ...parsedInput.data,
        administratorObjectId: principal.objectId,
        administratorSubject: principal.subject,
        applicationId: parsedApplicationId.data,
        correlationId: request.id,
      });
      if (!application) {
        return reply.status(409).send(problem(
          request.id, 409, "APPLICATION_NOT_PENDING", "Conflict",
          "The landlord onboarding application is not pending.",
        ));
      }
      return reply.send({
        data: landlordOnboardingApplicationSchema.parse(application),
        meta: { requestId: request.id },
      });
    },
  );

  app.get("/api/v1/admin/public-listings/pending-review", async (request, reply) => {
    if (!dependencies.authenticator || !dependencies.publicListingPublication) {
      return reply.status(503).send(problem(
        request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
        "Public-listing media review is temporarily unavailable.",
      ));
    }
    const principal = await authenticate(
      request.headers.authorization,
      dependencies.authenticator,
    );
    if (!principal) {
      return reply.status(401).send(problem(
        request.id, 401, "UNAUTHENTICATED", "Unauthorized",
        "A valid bearer credential is required.",
      ));
    }
    if (!isAuthorizedPlatformAdminAction(principal, "review_public_listing_media", dependencies)) {
      return reply.status(404).send(problem(
        request.id, 404, "NOT_FOUND", "Not Found",
        "The requested resource was not found.",
      ));
    }
    const items = await dependencies.publicListingPublication.listPendingMediaReview();
    return reply.send(
      pendingPublicListingMediaReviewListEnvelopeSchema.parse({
        items,
        meta: { requestId: request.id },
      }),
    );
  });

  app.post<{ Params: { listingId: string } }>(
    "/api/v1/admin/public-listings/:listingId/media-review",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.publicListingPublication) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Public-listing media review is temporarily unavailable.",
        ));
      }
      const principal = await authenticate(
        request.headers.authorization,
        dependencies.authenticator,
      );
      if (!principal) {
        return reply.status(401).send(problem(
          request.id, 401, "UNAUTHENTICATED", "Unauthorized",
          "A valid bearer credential is required.",
        ));
      }
      if (!isAuthorizedPlatformAdminAction(principal, "review_public_listing_media", dependencies)) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      const parsedListingId = publicListingIdSchema.safeParse(request.params.listingId);
      const parsedInput = publicListingMediaReviewInputSchema.safeParse(request.body);
      if (!parsedListingId.success || !parsedInput.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The media review decision is invalid.",
          parsedInput.success ? undefined : parsedInput.error.flatten(),
        ));
      }
      const reviewed = await dependencies.publicListingPublication.reviewPublicListingMedia({
        correlationId: request.id,
        decision: parsedInput.data.decision,
        listingId: parsedListingId.data,
        notes: parsedInput.data.notes ?? null,
        reviewerObjectId: principal.objectId,
        reviewerSubject: principal.subject,
        source: "runtime_api",
      });
      if (!reviewed) {
        return reply.status(409).send(problem(
          request.id, 409, "LISTING_NOT_PENDING", "Conflict",
          "The PublicListing is not awaiting media review.",
        ));
      }
      return reply.send(
        publicListingMediaReviewEnvelopeSchema.parse({
          data: reviewed,
          meta: { requestId: request.id },
        }),
      );
    },
  );

  // Fixes a gap found while finishing REQ-038: a platform administrator
  // could not previously see the bytes of an uploaded (non-URL) listing
  // image anywhere before deciding its media review, because the public
  // scan-gated content route (below) only serves a published listing's
  // images. This route serves the same bytes, gated the same way as the
  // review decision route above (platform-admin authorization, 404 for
  // anyone else), and only while the listing is still pending review
  // (migration 0033).
  app.get<{ Params: { listingId: string; imageId: string } }>(
    "/api/v1/admin/public-listings/:listingId/images/:imageId/content",
    async (request, reply) => {
      if (!dependencies.authenticator || !dependencies.publicListingMedia) {
        return reply.status(503).send(problem(
          request.id, 503, "DEPENDENCY_UNAVAILABLE", "Service Unavailable",
          "Public-listing media review is temporarily unavailable.",
        ));
      }
      const principal = await authenticate(
        request.headers.authorization,
        dependencies.authenticator,
      );
      if (!principal) {
        return reply.status(401).send(problem(
          request.id, 401, "UNAUTHENTICATED", "Unauthorized",
          "A valid bearer credential is required.",
        ));
      }
      if (!isAuthorizedPlatformAdminAction(principal, "review_public_listing_media", dependencies)) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      const parsedListingId = publicListingIdSchema.safeParse(request.params.listingId);
      const parsedImageId = publicListingImageIdSchema.safeParse(request.params.imageId);
      if (!parsedListingId.success || !parsedImageId.success) {
        return reply.status(400).send(problem(
          request.id, 400, "VALIDATION_ERROR", "Validation Error",
          "The listing or image ID is invalid.",
        ));
      }
      const content = await dependencies.publicListingMedia.getReviewImageContent(
        parsedListingId.data,
        parsedImageId.data,
      );
      if (!content) {
        return reply.status(404).send(problem(
          request.id, 404, "NOT_FOUND", "Not Found",
          "The requested resource was not found.",
        ));
      }
      return reply
        .status(200)
        .header("content-type", content.mediaType)
        .send(content.content);
    },
  );

  app.post(
    "/api/v1/viewing-requests",
    {
      config: {
        rateLimit: {
          max: dependencies.viewingRequestRateLimitMax ?? 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
    if (!dependencies.publicViewingRequests) {
      return reply
        .status(503)
        .send(
          problem(
            request.id,
            503,
            "DEPENDENCY_UNAVAILABLE",
            "Service Unavailable",
            "Viewing requests are temporarily unavailable.",
          ),
        );
    }

    const parsedInput = publicViewingRequestInputSchema.safeParse(request.body);
    if (!parsedInput.success) {
      return reply
        .status(400)
        .send(
          problem(
            request.id,
            400,
            "VALIDATION_ERROR",
            "Validation Error",
            "The viewing request is invalid.",
            parsedInput.error.flatten(),
          ),
        );
    }

    const accepted = await dependencies.publicViewingRequests.create({
      ...parsedInput.data,
      correlationId: request.id,
    });
    if (!accepted) {
      return reply
        .status(404)
        .send(
          problem(
            request.id,
            404,
            "NOT_FOUND",
            "Not Found",
            "The requested property was not found.",
          ),
        );
    }

    return reply.status(202).send({
      data: publicRequestReceiptSchema.parse({
        reference: request.id,
        status: "accepted",
      }),
      meta: { requestId: request.id },
    });
    },
  );

  return app;
}