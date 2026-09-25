FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/brand/package.json packages/brand/package.json
COPY packages/browser-auth/package.json packages/browser-auth/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

ARG VITE_ENTRA_API_SCOPE
ARG VITE_ENTRA_AUTHORITY
ARG VITE_ENTRA_CLIENT_ID
ARG VITE_KEYFORTA_API_BASE_URL
ENV VITE_ENTRA_API_SCOPE=$VITE_ENTRA_API_SCOPE
ENV VITE_ENTRA_AUTHORITY=$VITE_ENTRA_AUTHORITY
ENV VITE_ENTRA_CLIENT_ID=$VITE_ENTRA_CLIENT_ID
ENV VITE_KEYFORTA_API_BASE_URL=$VITE_KEYFORTA_API_BASE_URL

COPY apps/admin-web apps/admin-web
COPY packages/brand packages/brand
COPY packages/browser-auth packages/browser-auth
COPY packages/contracts packages/contracts
COPY packages/types packages/types
COPY packages/ui packages/ui
RUN pnpm --filter @keyforta/admin-web build

FROM nginxinc/nginx-unprivileged:1.29.4-alpine@sha256:a6c4f61f456b85b8fdf7ec7ab28cc3e299440e6fb4a9dea520e5fd8fd440025e AS runtime
COPY deployments/azure/docker/admin-web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /workspace/apps/admin-web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["wget", "--quiet", "--spider", "http://127.0.0.1:8080/"]