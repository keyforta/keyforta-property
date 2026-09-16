import { buildMcpApp } from "./app.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("MCP production startup requires an approved authenticator.");
}

throw new Error("MCP server startup is disabled until an approved authenticator is configured.");

void buildMcpApp;
