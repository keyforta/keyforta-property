# Test strategy

Use the lowest deterministic layer that proves the risk.

| Layer                | Responsibility                                                                          | Location / gate                                                            |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Unit                 | Pure money, schedule, authorization, parsing, and failure boundaries                    | `packages/*/test`, `apps/*/test`; `pnpm test`                              |
| Component/BFF        | Rendering helpers, request shaping, cookie/proxy behavior, loading/error/denied states  | `apps/public-web/test`; add a DOM runner only through approved tooling            |
| API contract         | Zod input/output compatibility and sanitized transport behavior                         | `packages/contracts`, `apps/api/test/app.test.ts`                          |
| Database integration | Migrations, constraints, RLS, transactions, idempotency, immutability, cross-org denial | `apps/api/test/postgres.integration.test.ts`; CI PostgreSQL service        |
| Architecture         | Domain dependency direction and package boundaries                                      | `pnpm check:architecture`, package tests, and review                        |
| Infrastructure       | Bicep compilation and pilot resource policy                                             | CI compilation and policy review                                           |
| Security             | Negative authorization, isolation, secret patterns, dependency audit, abuse cases       | application tests, `pnpm check:secrets`, dependency audit, and CI           |
| Accessibility        | Keyboard, semantics, focus, contrast, responsive states                                 | manual review pending an approved automated runner                         |
| End-to-end/smoke     | A few public/authenticated critical boundaries after deployment                         | deployment workflow; never substitute for lower-layer rules                |
| Migration/regression | Forward migration from supported state and exact incident reproductions                 | PostgreSQL suite and focused regression tests                              |

Tests use stable UUIDs, fixed dates, integer minor units, local service containers,
and synthetic identities. Do not call uncontrolled providers. Retries are bounded
and limited to deployed-service readiness. Snapshot tests do not replace semantic
assertions. Every authorization data path needs same-organization success and
cross-organization denial. AI work additionally requires the versioned evaluation
and safe-fallback evidence in `docs/ai/EVALUATION_PLAN.md`.
