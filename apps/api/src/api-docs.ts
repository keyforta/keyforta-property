import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

const httpMethods = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);
const openApiPath = fileURLToPath(
  new URL("../../../docs/openapi.yaml", import.meta.url),
);

type OpenApiDocument = {
  info: Record<string, unknown>;
  paths: Record<string, Record<string, unknown>>;
  servers?: Array<{ url: string }>;
};

export function runtimeOpenApiDocument<Document>(document: Document): Document {
  const runtimeDocument = structuredClone(document) as Document & OpenApiDocument;
  runtimeDocument.info.description =
    "Implemented KEYFORTA API operations available in this local runtime.";
  runtimeDocument.paths = Object.fromEntries(
    Object.entries(runtimeDocument.paths).flatMap(([path, pathItem]) => {
      const runtimePathItem = Object.fromEntries(
        Object.entries(pathItem).filter(([method, operation]) =>
          !httpMethods.has(method) ||
          (typeof operation === "object" &&
            operation !== null &&
            "x-keyforta-runtime" in operation &&
            operation["x-keyforta-runtime"] === true),
        ),
      );
      return Object.keys(runtimePathItem).some((key) => httpMethods.has(key))
        ? [[path, runtimePathItem]]
        : [];
    }),
  );
  runtimeDocument.servers = [{ url: "/api/v1" }];
  return runtimeDocument;
}

export async function registerApiDocs(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    mode: "static",
    specification: {
      baseDir: dirname(openApiPath),
      path: openApiPath,
      postProcessor: runtimeOpenApiDocument,
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/api/docs",
    staticCSP: true,
    uiConfig: {
      deepLinking: true,
      docExpansion: "list",
      tryItOutEnabled: true,
    },
  });
}