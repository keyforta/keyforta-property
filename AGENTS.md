# Agent Working Agreement

These instructions apply to human-directed AI coding agents working anywhere
in this repository.

## Product invariants

1. Never use binary floating point for money.
2. Never silently edit a posted financial transaction; reverse and replace it.
3. Never trust an organization, user, role, property, unit, lease, or tenant ID
   supplied by a client without authorization at the application boundary.
4. Never allow an AI model to access the database directly. Models use narrow,
   typed, authorized tools.
5. Never make tenant acceptance, eviction, legal, pricing, refund, or money
   movement decisions autonomous.
6. Preserve document versions, evidence references, human approvals, and audit
   correlation IDs.
7. Keep the product usable when AI is unavailable.

## Engineering loop

1. Read the relevant product requirement, domain documentation, and ADRs.
2. State the business invariant affected by the change.
3. Add or update acceptance tests before completing implementation.
4. Include authorization and cross-organization isolation tests for data paths.
5. For AI behavior, update the evaluation set and safe-fallback test.
6. Run `pnpm verify`; required GitHub CI checks must pass before merge.
7. Update documentation in the same pull request.

During foundation setup, `pnpm verify` runs product checks and production builds.
The engineering harness and Evidence-Driven Development lifecycle are available
for explicit evaluation but are not merge or implementation prerequisites until
the product owner activates them.

## Architecture boundaries

- `packages/contracts`, `packages/auth`, and `packages/authorization` contain
   shared deterministic contracts and rules; they must not import application UI.
- `apps/api` owns transport, validation, authorization orchestration, and calls
  into domain capabilities.
- `apps/public-web`, `apps/portal-web`, and `apps/admin-web` consume public
   contracts; they do not duplicate financial or authorization logic.
- Integrations must sit behind interfaces and treat inbound callbacks as
  untrusted and potentially duplicated.
- New deployable services require an accepted ADR showing a measurable need.

## Change discipline

- Make small, reviewable changes with one clear outcome.
- Do not commit secrets, real tenant data, identity documents, signed leases,
  payment details, model transcripts containing personal data, or production
  exports.
- Use synthetic fixtures in tests and examples.
- Do not weaken lint, type, test, audit, authorization, or AI safety controls to
  make a build pass.
- Do not approve your own review, waiver, protected-policy gate, or production
  transition. Preserve failed evidence and stop after three automated repairs.
