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

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5 AS runtime
# Apply available Alpine security patches at build time so this image isn't
# stuck with whatever packages were current when the upstream base image was
# last published; keeps the deploy workflow's Trivy gate green as new fixes
# land in Alpine's repos between upstream nginx-unprivileged image builds.
# The base image already runs as the unprivileged "nginx" user, so switch to
# root for the upgrade and back to nginx afterwards.
USER root
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*
COPY deployments/azure/docker/admin-web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /workspace/apps/admin-web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["wget", "--quiet", "--spider", "http://127.0.0.1:8080/"]