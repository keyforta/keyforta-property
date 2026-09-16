import { buildApp } from "./app.js";
import {
  createDatabasePool,
  createRuntimeDatabaseClient,
} from "./database.js";
import { developmentPublicProperties } from "./properties/development-data.js";
import { createMemoryPublicPropertyGateway } from "./properties/gateway.js";
import { createPostgresPublicPropertyGateway } from "./properties/postgres-gateway.js";
import {
  createMemoryPublicViewingRequestGateway,
  createPostgresPublicViewingRequestGateway,
} from "./properties/viewing-gateway.js";

const isProduction = process.env.NODE_ENV === "production";
const corsAllowedOrigin = process.env.CORS_ALLOWED_ORIGIN;
if (isProduction && !corsAllowedOrigin) {
  throw new Error("CORS_ALLOWED_ORIGIN is required in production.");
}
const databasePool = isProduction ? createDatabasePool() : undefined;
const databaseClient = databasePool
  ? createRuntimeDatabaseClient(databasePool)
  : undefined;
const publicProperties = databaseClient
  ? createPostgresPublicPropertyGateway(databaseClient)
  : createMemoryPublicPropertyGateway(developmentPublicProperties);
const publicViewingRequests = databaseClient
  ? createPostgresPublicViewingRequestGateway(databaseClient)
  : createMemoryPublicViewingRequestGateway(
      new Set(
        developmentPublicProperties
          .filter((property) => property.published)
          .map((property) => property.id),
      ),
    );
const port = Number(process.env.API_PORT ?? "3000");
const host = process.env.API_HOST ?? "127.0.0.1";

try {
  const app = await buildApp({
    ...(corsAllowedOrigin ? { corsOrigin: corsAllowedOrigin } : {}),
    publicProperties,
    publicViewingRequests,
    readiness: async () => {
      await databaseClient?.query("select 1");
    },
  });

  if (databasePool) {
    app.addHook("onClose", async () => databasePool.end());
  }

  const shutdown = async () => {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
    await app.close();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await app.listen({ host, port });
} catch (error) {
  await databasePool?.end();
  throw error;
}