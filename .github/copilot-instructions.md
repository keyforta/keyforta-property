# KEYFORTA repository instructions

Follow `AGENTS.md` as the binding working agreement. Treat the contracts and
specifications under `docs/` as authoritative; never invent or alter functional
requirements. Record ambiguity in `docs/engineering/REQUIREMENTS_GAPS.md` and
request product-owner clarification.

The repository is a pnpm React/Vite monorepo: public schemas in
`packages/contracts`, authentication and authorization in `packages/auth` and
`packages/authorization`, transport and persistence in `apps/api`, user-facing
interfaces in `apps/public-web`, `apps/portal-web`, and `apps/admin-web`,
and forward-only PostgreSQL migrations in `docs/database`.

Work from approved product requirements and run `pnpm verify`; never weaken a
gate, expose secrets, use real tenant data, or deploy without explicit
authorization. Add authorization and cross-organization tests for data paths.
Preserve integer minor-unit money, immutable posted financial history, human
decisions, document versions, audit correlation IDs, and operation when AI is
unavailable. Repository approval records never replace GitHub controls.

Use product-focused specialists from `.github/agents/` and procedures from
`.github/skills/` when their descriptions match the request. These
customizations provide guidance only: they do not create approval authority,
verification status, or permission to bypass repository and GitHub controls.

Update authoritative documentation with consequential changes. Stop for human
approval before changing requirements, scope, architecture style, technology,
paid services, auth, data lifecycle, destructive migrations, payment boundaries,
security or quality controls, or production infrastructure/deployment.
