FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/public-web/package.json apps/public-web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/brand/package.json packages/brand/package.json
COPY packages/browser-auth/package.json packages/browser-auth/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_ENTRA_API_SCOPE
ARG NEXT_PUBLIC_ENTRA_AUTHORITY
ARG NEXT_PUBLIC_ENTRA_CLIENT_ID
ENV NEXT_PUBLIC_ENTRA_API_SCOPE=$NEXT_PUBLIC_ENTRA_API_SCOPE
ENV NEXT_PUBLIC_ENTRA_AUTHORITY=$NEXT_PUBLIC_ENTRA_AUTHORITY
ENV NEXT_PUBLIC_ENTRA_CLIENT_ID=$NEXT_PUBLIC_ENTRA_CLIENT_ID

COPY apps/public-web apps/public-web
COPY packages/api-client packages/api-client
COPY packages/brand packages/brand
COPY packages/browser-auth packages/browser-auth
COPY packages/contracts packages/contracts
COPY packages/types packages/types
COPY packages/ui packages/ui
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