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
COPY .openai/hosting.json .openai/hosting.json
RUN pnpm --filter @keyforta/public-web build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build /workspace/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/ || exit 1