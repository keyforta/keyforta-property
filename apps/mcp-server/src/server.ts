import { buildMcpServer } from "./app.js";
import { loadMcpRuntimeConfiguration } from "./runtime-config.js";

async function start(): Promise<void> {
  const configuration = loadMcpRuntimeConfiguration();

  const app = await buildMcpServer({
    ...configuration.serverDependencies,
    auditSink: (record) => {
      app.log.info(record, "mcp.request");
    },
  });

  await app.listen({
    host: configuration.host,
    port: configuration.port,
  });
}

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "MCP startup failed.");
  process.exitCode = 1;
});
