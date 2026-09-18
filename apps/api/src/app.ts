import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  landlordOnboardingApplicationIdSchema,
  landlordOnboardingApplicationInputSchema,
  landlordOnboardingApplicationListSchema,
  landlordOnboardingApplicationSchema,
  landlordOnboardingDecisionInputSchema,
  organizationIdSchema,
  publicListingIdSchema,
  publicPropertyIdSchema,
  publicPropertyListQuerySchema,
  publicPropertyListResultSchema,
  publicPropertyProjectionSchema,
  publicRequestReceiptSchema,
  publicViewingRequestInputSchema,
} from "@keyforta/contracts";
import { canAccess } from "@keyforta/authorization";
import Fastify, { type FastifyInstance } from "fastify";

import { registerApiDocs } from "./api-docs.js";
import type { Principal, PrincipalAuthenticator } from "./authentication.js";
import type { LandlordOnboardingGateway } from "./onboarding/gateway.js";
import {
  InvalidPublicPropertyCursorError,
  type PublicPropertyGateway,
} from "./properties/gateway.js";
import type { PublicListingPublicationGateway } from "./properties/publication-gateway.js";
import type { PublicViewingRequestGateway } from "./properties/viewing-gateway.js";

const serviceName = "keyforta-api";
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface AppDependencies {
  apiDocs?: boolean;
  authenticator?: PrincipalAuthenticator;
  corsOrigin?: string | string[] | boolean;
  landlordOnboarding?: LandlordOnboardingGateway;
  landlordOnboardingRateLimitMax?: number;
  platformAdminObjectIds?: ReadonlySet<string>;
  publicListingPublication?: PublicListingPublicationGateway;
  publicProperties?: PublicPropertyGateway;
  publicViewingRequests?: PublicViewingRequestGateway;
  readiness?: () => Promise<void>;
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
function isAuthorizedPlatformAdminAction(
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