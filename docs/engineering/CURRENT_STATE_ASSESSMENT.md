# Current-state engineering assessment

Assessment date: 2026-09-11. Evidence is repository-local. Functional authority
remains `docs/product/PRD.md` and its linked product documents.

## Current system

KEYFORTA is a pnpm 11/Turbo/TypeScript 5.9 modular monolith on Node 24.
`apps/public-web` is a Next.js 16 BFF and UI, `apps/api` is Fastify 5 orchestration and
persistence, `packages/contracts` owns Zod wire schemas, and `packages/contracts`
owns pure deterministic authorization, lease, and payment rules. PostgreSQL uses
forward migrations, application authorization, forced RLS, immutable financial
records, and synthetic integration fixtures. Azure Container Apps, PostgreSQL,
private Blob evidence storage, Defender scanning, managed identities, and OIDC
federation are defined in Bicep. GitHub Actions validates, plans, deploys, and
seeds through separate workflows.

## Strong foundations

- `AGENTS.md`, ADR-0001, and package layout establish a coherent modular-monolith
  boundary; `harness/graders/architecture.mjs` now enforces the pure-domain edge.
- Integer minor-unit money, append-only corrections, human application review,
  correlation IDs, and organization isolation are encoded in domain, SQL, and
  tests.
- CI already runs PostgreSQL 17 integration tests, dependency audit, Bicep
  compilation, and immutable container builds.
- Deployment requires an exact-SHA successful plan artifact and manual dispatch.
- Security, AI tool policy, release checklist, SLO direction, and incident
  runbooks already exist and are preserved as authoritative sources.

## Findings

### Blocking

None in the existing validation baseline: `pnpm check` passed before this work.
External release remains blocked by the explicit pre-beta controls in
`docs/architecture/SECURITY.md`, not by this engineering-system change.

### High priority

1. Repository-local Copilot roles and precedence were absent. Evidence: before
   this change `.github/agents`, `.github/instructions`, and
   `.github/copilot-instructions.md` did not exist.
2. The repository includes enforcement for task scope, protected paths,
   architecture edges, secret patterns, documentation impact, and
   machine-readable evidence. This harness remains dormant during foundation
   setup; `pnpm verify` currently runs product checks and production builds.
3. Application telemetry is limited to Fastify logging, correlation IDs,
   health/readiness probes, and platform logs. There is no OpenTelemetry trace
   or application-metric implementation; see `OBSERVABILITY.md` for the safe
   convention and activation gate.
4. CI has dependency auditing but no platform-native secret-scanning or CodeQL
   workflow represented in source. The deterministic pattern grader is a first
   line, not a replacement for GitHub secret scanning.
5. Accessibility has no browser/component runner. Harness evaluation reports
  this as skipped rather than presenting review as automated evidence.

### Recommended

- Add an approved accessibility tool and representative keyboard/semantic tests.
- Add CodeQL, SBOM generation, and container vulnerability scanning after owner
  review of execution cost and artifact retention.
- Add OpenTelemetry-compatible request traces and low-cardinality metrics before
  external beta; never put organization, document, token, or payment identifiers
  into metric labels.
- Exercise PostgreSQL restore and OAuth failure runbooks before real pilot data.
- Expand architecture checks only when a concrete boundary violation is observed.

### Deferred

Production/staging stamps, HA, private networking, AI runtime/evaluations, paid
observability additions, External ID replacement of temporary B2B onboarding,
and microservice extraction remain governed by existing ADRs and owner gates.
They are not activated by this pull request.

## Implementation sequence

1. Finish and validate the product foundation with product-focused CI.
2. Review and activate governance and harness enforcement as a separate decision.
3. Add accessibility and security platform checks as separately approved tasks.
4. Instrument telemetry against `OBSERVABILITY.md`, then validate proposed SLOs.
5. Run restore and incident exercises before external data or commitments.
