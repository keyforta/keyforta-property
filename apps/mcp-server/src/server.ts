import { buildMcpServer } from "./app.js";
import { createStaticAuthenticator } from "./auth.js";

/**
 * Local development entrypoint. The MCP boundary is not approved for
 * production deployment or public ingress, so startup fails closed outside
 * local and test environments and without an explicitly provisioned
 * development credential.
 */
async function start(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "The KEYFORTA MCP server is not approved for production deployment.",
    );
  }

  const developmentToken = process.env.MCP_DEVELOPMENT_ACCESS_TOKEN;
  if (!developmentToken) {
    throw new Error(
      "Set MCP_DEVELOPMENT_ACCESS_TOKEN to a locally generated development credential.",
    );
  }

  const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const app = await buildMcpServer({
    allowedOrigins,
    auditSink: (record) => {
      app.log.info(record, "mcp.request");
    },
    authenticator: createStaticAuthenticator({ token: developmentToken }),
  });

  await app.listen({
    host: process.env.MCP_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.MCP_PORT ?? "3100", 10),
  });
}

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "MCP startup failed.");
  process.exitCode = 1;
});
