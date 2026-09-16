FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/public-web/package.json apps/public-web/package.json
COPY packages/brand/package.json packages/brand/package.json
RUN pnpm install --frozen-lockfile

COPY apps/public-web apps/public-web
COPY packages/brand packages/brand
RUN pnpm --filter @keyforta/public-web build

FROM node:24-bookworm-slim AS runtime
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/public-web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/public-web/.next/static ./apps/public-web/.next/static
COPY --from=build --chown=node:node /workspace/apps/public-web/public ./apps/public-web/public
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/public-web/server.js"]