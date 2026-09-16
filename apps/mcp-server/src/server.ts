import { buildMcpApp } from './app.js';
import {
  assertSyntheticLoopbackHost,
  localAllowedHosts,
  resolveRuntimeAuthenticator,
} from './runtime-auth.js';

const host = process.env.MCP_HOST ?? '127.0.0.1';
const port = Number(process.env.MCP_PORT ?? '3200');
assertSyntheticLoopbackHost(host);
const app = await buildMcpApp({
  allowedHosts: localAllowedHosts(port),
  allowedOrigins: ['http://127.0.0.1:3100'],
  authenticate: resolveRuntimeAuthenticator(process.env),
});

await app.listen({ host, port });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);