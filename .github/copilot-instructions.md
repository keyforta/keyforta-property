# KEYFORTA repository instructions

Follow `AGENTS.md` as the binding working agreement. Treat the contracts and
specifications under `docs/` as authoritative; never invent or alter functional
requirements. Record ambiguity in `docs/engineering/REQUIREMENTS_GAPS.md` and
request product-owner clarification.

The repository is a pnpm React/Vite monorepo: public schemas in
`packages/contracts`, authentication and authorization in `packages/auth` and
`packages/authorization`, transport and persistence in `apps/api`, user-facing
interfaces in `apps/public-web`, `apps/portal-web`, and `apps/admin-web`,
forward-only PostgreSQL migrations in `docs/database`, and deterministic
engineering enforcement in `harness`.

During foundation setup, work directly from approved product requirements and
run `pnpm verify`. Task contracts, harness lifecycle transitions, and generated
evidence are opt-in until the product owner activates the harness. Never expose
secrets, use real tenant data, or deploy without explicit authorization. Add
authorization and cross-organization tests for data paths. Preserve integer
minor-unit money, immutable posted financial history, human decisions, evidence
versions, audit correlation IDs, and operation when AI is unavailable.

Resolve agent identity, lifecycle, capability ownership, and routing through
`harness/policies/agent-registry.json` and `harness/policies/agent-routing.json`.
Do not invoke deferred, experimental, or retired roles. Use structured handoffs;
repository approval records never replace GitHub controls.

Use repository procedures from `.github/skills/<skill-name>/SKILL.md` when their
discovery descriptions match the request. Skills do not create authority.
External GitHub and product-owner approvals remain authoritative.

Update authoritative documentation with consequential changes. Stop for human
approval before changing requirements, scope, architecture style, technology,
paid services, auth, data lifecycle, destructive migrations, payment boundaries,
security or quality controls, protected harness policy, deferred-agent status,
or production infrastructure/deployment.
