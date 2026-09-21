import { buildApp, parseCorsOrigins } from "./app.js";
import {
  createEntraPrincipalAuthenticator,
  parsePlatformAdminObjectIds,
} from "./authentication.js";
import {
  assertRuntimeDatabaseReady,
  createDatabasePool,
  createRuntimeDatabaseClient,
} from "./database.js";
import { createPostgresLandlordOnboardingGateway } from "./onboarding/gateway.js";
import { createPostgresMembershipLookupGateway } from "./identity/membership-gateway.js";
import { developmentPublicProperties } from "./properties/development-data.js";
import { createMemoryPublicPropertyGateway } from "./properties/gateway.js";
import { createPostgresInventoryGateway } from "./properties/inventory-gateway.js";
import { createPostgresRentalInventoryCommandGateway } from "./properties/inventory-command-gateway.js";
import { createPostgresPublicPropertyGateway } from "./properties/postgres-gateway.js";
import { createPostgresPublicListingPublicationGateway } from "./properties/publication-gateway.js";
import {
  createMemoryPublicViewingRequestGateway,
  createPostgresPublicViewingRequestGateway,
} from "./properties/viewing-gateway.js";

const isProduction = process.env.NODE_ENV === "production";
const corsAllowedOrigins = parseCorsOrigins(process.env.CORS_ALLOWED_ORIGIN);
if (isProduction && corsAllowedOrigins.length === 0) {
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
const entraConfiguration = {
  audience: process.env.ENTRA_AUDIENCE,
  issuer: process.env.ENTRA_ISSUER,
  jwksUri: process.env.ENTRA_JWKS_URI,
};
if (
  isProduction &&
  (!entraConfiguration.audience ||
    !entraConfiguration.issuer ||
    !entraConfiguration.jwksUri)
) {
  throw new Error("ENTRA_AUDIENCE, ENTRA_ISSUER, and ENTRA_JWKS_URI are required in production.");
}
const authenticator =
  entraConfiguration.audience &&
  entraConfiguration.issuer &&
  entraConfiguration.jwksUri
    ? createEntraPrincipalAuthenticator({
        audience: entraConfiguration.audience,
        issuer: entraConfiguration.issuer,
        jwksUri: entraConfiguration.jwksUri,
      })
    : undefined;
const publicListingPublication = databaseClient
  ? createPostgresPublicListingPublicationGateway(databaseClient)
  : undefined;
const landlordOnboarding = databaseClient
  ? createPostgresLandlordOnboardingGateway(databaseClient)
  : undefined;
const inventory = databaseClient
  ? createPostgresInventoryGateway(databaseClient)
  : undefined;
const rentalInventoryCommands = databaseClient
  ? createPostgresRentalInventoryCommandGateway(databaseClient)
  : undefined;
const membershipLookup = databaseClient
  ? createPostgresMembershipLookupGateway(databaseClient)
  : undefined;
const platformAdminObjectIds = parsePlatformAdminObjectIds(
  process.env.PLATFORM_ADMIN_OBJECT_IDS,
);
// Rollback switch for the shared authorization module (see AppDependencies
// `useAuthorizationModule` in app.ts). Defaults to enabled; set
// AUTHORIZATION_MODULE_ENABLED=false to revert the onboarding-review routes
// to the legacy platform-admin allowlist check without a code deploy.
const useAuthorizationModule = process.env.AUTHORIZATION_MODULE_ENABLED !== "false";
const port = Number(process.env.API_PORT ?? "3000");
const host = process.env.API_HOST ?? "127.0.0.1";

try {
  const app = await buildApp({
    apiDocs: !isProduction,
    ...(authenticator ? { authenticator } : {}),
    ...(corsAllowedOrigins.length > 0 ? { corsOrigin: corsAllowedOrigins } : {}),
    ...(landlordOnboarding ? { landlordOnboarding } : {}),
    ...(inventory ? { inventory } : {}),
    ...(membershipLookup ? { membershipLookup } : {}),
    ...(publicListingPublication ? { publicListingPublication } : {}),
    ...(rentalInventoryCommands ? { rentalInventoryCommands } : {}),
    platformAdminObjectIds,
    publicProperties,
    publicViewingRequests,
    readiness: async () => {
      if (databaseClient) await assertRuntimeDatabaseReady(databaseClient);
    },
    useAuthorizationModule,
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