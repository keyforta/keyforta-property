import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {
  publicPropertyIdSchema,
  publicPropertyListQuerySchema,
  publicPropertyListResultSchema,
  publicPropertyProjectionSchema,
} from "@keyforta/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import {
  InvalidPublicPropertyCursorError,
  type PublicPropertyGateway,
} from "./properties/gateway.js";

const serviceName = "keyforta-api";
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface AppDependencies {
  publicProperties?: PublicPropertyGateway;
  readiness?: () => Promise<void>;
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

export async function buildApp(
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
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
  await app.register(cors, {
    origin: process.env.NODE_ENV === "production" ? false : true,
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
      return reply.send({
        ...publicPropertyListResultSchema.parse(result),
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
            data: publicPropertyProjectionSchema.parse(property),
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

  return app;
}