FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build

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

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime
ENV NODE_ENV=production
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=3100
WORKDIR /workspace

# The runtime container only ever runs `node apps/mcp-server/dist/server.js`;
# it never invokes npm, npx, yarn, corepack, or pnpm. Removing these bundled
# CLIs (and their vendored dependency trees, which carry their own CVEs
# independent of this workspace's pnpm-lock.yaml) shrinks the attack surface
# and keeps the image out of unrelated upstream CLI vulnerability scans.
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /opt/yarn-v1.22.22 \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg \
      /usr/local/bin/pnpm \
      /usr/local/bin/pnpx \
      /usr/local/bin/corepack

COPY --from=build --chown=node:node /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /workspace/node_modules node_modules
COPY --from=build --chown=node:node /workspace/apps/mcp-server apps/mcp-server
COPY --from=build --chown=node:node /workspace/packages packages

USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/mcp-server/dist/server.js"]