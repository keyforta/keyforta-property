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
3. Capture **before** evidence: reproduce the current (missing/broken) behavior
   with a command, screenshot, log, or failing request/response and record it
   in the PR description. This proves the gap existed.
4. Write the acceptance/regression test(s) first and confirm they **fail for
   the right reason** (red) against the unmodified code. Record the failing
   run's output.
5. Include authorization and cross-organization isolation tests for data paths.
6. Implement the smallest change that makes the new tests pass without
   weakening any other assertion.
7. Capture **after** evidence: rerun the same reproduction from step 3 and the
   same test(s) from step 4, now passing (green), and record both outputs in
   the PR description alongside the before evidence.
8. For AI behavior, update the evaluation set and safe-fallback test.
9. Run `pnpm verify`; required GitHub CI checks must pass before merge.
10. Update documentation in the same pull request.

Every pull request must show four things, in this order, in its description:
**before (broken) evidence → failing test (red) → after (working) evidence →
passing test (green)**. A PR that only shows the "after" state is incomplete.
Reviewers must reject PRs missing any of the four.

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
   transition. Required GitHub reviews remain external human controls.
