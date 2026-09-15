import { buildApp } from "./app.js";
import { developmentPublicProperties } from "./properties/development-data.js";
import { createMemoryPublicPropertyGateway } from "./properties/gateway.js";

const isProduction = process.env.NODE_ENV === "production";
const publicProperties = isProduction
  ? undefined
  : createMemoryPublicPropertyGateway(developmentPublicProperties);
const app = await buildApp({
  ...(publicProperties ? { publicProperties } : {}),
  readiness: async () => {
    if (!publicProperties) throw new Error("Public property gateway is unavailable");
  },
});

const port = Number(process.env.API_PORT ?? "3000");
const host = process.env.API_HOST ?? "127.0.0.1";

await app.listen({ host, port });