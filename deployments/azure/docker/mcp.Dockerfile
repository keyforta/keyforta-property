FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

COPY apps/mcp-server apps/mcp-server
COPY packages/contracts packages/contracts
COPY packages/types packages/types
RUN pnpm --filter @keyforta/mcp-server... build

FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS runtime
ENV NODE_ENV=production
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=3100
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY --from=build --chown=node:node /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /workspace/node_modules node_modules
COPY --from=build --chown=node:node /workspace/apps/mcp-server apps/mcp-server
COPY --from=build --chown=node:node /workspace/packages packages

USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/mcp-server/dist/server.js"]