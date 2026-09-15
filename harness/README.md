# Engineering harness

This directory contains deterministic, offline-first enforcement for task scope,
protected paths, architecture boundaries, secret patterns, and verification
evidence. It does not define product behavior.

## Task contracts

Every implementation pull request updates or supplies a machine-readable contract
validated against `schemas/task-contract.schema.json`. Set
`HARNESS_TASK_CONTRACT` when the active contract is not
`tasks/mvp-engineering-system.json`. A contract records requirement references,
allowed paths, protected-path declarations, evidence, risks, rollback, task
classification, workflow state, acceptance-test mappings, and repair-cycle
count. Protected paths require explicit entries in
`declaredProtectedPaths`; an allowed prefix alone is insufficient. This local
declaration does not prove human approval. CODEOWNERS review and protected-branch
settings are the external approval boundary.

On pull requests, the active contract is the single changed JSON file under
`tasks/`, excluding the repository-neutral example. Set `HARNESS_TASK_CONTRACT`
for an explicit override; verification fails when selection is missing or
ambiguous. Branch-push CI explicitly skips contract-bound diff policy because no
single task contract is guaranteed across a push range; all source-quality gates
still run.

## Verification

Run `pnpm verify` or `pnpm verify:all` from the repository root. It runs policy,
contract, agent-governance, Agent Skills, classification, workflow-state, and
evidence checks plus formatting, lint, type checking, tests, architecture checks,
secret-pattern checks, documentation impact, the harness self-test, Bicep compilation
for every file when Azure CLI is installed, and production builds. CI invokes
this same command and adds the pilot-specific infrastructure policy and container
builds.
PostgreSQL integration tests require `DATABASE_URL` and `DATABASE_AUTH=password`;
CI supplies both and verification fails if CI loses `DATABASE_URL`. Local runs
without PostgreSQL clearly report that gate skipped.
Generated reports are written to `harness/reports/` and are not committed. The
mutable, network-backed dependency audit runs only in CI and is reported as
skipped by offline local verification. Required generated evidence is rewritten
and validated against the active contract, run timestamp, and passing status;
checked-in evidence must be a changed engineering document. If a gate fails,
every later unrun gate is recorded as skipped with the blocking gate named.
Pull-request CI generates `evidence-<TASK-ID>.json`, validates its changed-file
inventory, timestamps, command exit codes, requirement-to-verification
traceability, waivers, and hashed artifacts, then retains the reports for 30
days. Commit and branch values are descriptive metadata and are not compared
with the checkout. Local dirty-worktree evidence remains subject to the same
source, inventory, failure, and repair-cycle validation.
Waivers are retained as audit records but never suppress failed or skipped
checks, missing artifacts, or missing artifact sections. Final pull-request CI
validates the transition into the contract's declared current state against the
generated manifest, and EDD ends at `verified`. CI invokes the canonical
verifier entrypoint directly; package script aliases are conveniences for local
use. GitHub required checks, pull-request reviews, CODEOWNERS or rulesets, branch
protection, merge controls, protected environments, and deployment approvals
are external controls that repository evidence cannot replace.

Focused commands are `pnpm verify:task`, `pnpm verify:agents`,
`pnpm verify:skills`, `pnpm verify:classification`, `pnpm verify:evidence`, and
`pnpm verify:transition`. Set `EDD_TRANSITION_TO` to
evaluate advancement from the contract's current state. See
`docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md` for the normative protocol.

Expected duration is roughly two minutes with warm caches and longer for a clean
install. The first failing gate exits nonzero and stops later gates.

## Self-test

`pnpm harness:self-test` proves that valid contracts parse, missing fields fail,
unauthorized and protected paths are rejected, the synthetic fixture is stable,
a failed gate blocks completion, commit and branch metadata remain descriptive,
classification contradictions fail, states cannot be skipped, and transitions
require their artifacts. It also proves that inactive routing, self-review,
unknown requirement states, same-agent handoffs, and repository-only activation
approval fail. Required reviews remain enforced through GitHub controls.

Self-test suites live under `scripts/self-test/` and end in `.suite.mjs`. The
runner discovers them automatically and executes them in filename order; there
is no suite registry to edit. Prefix a new suite with a stable numeric domain
position, export only `registerSuite({ check, skip })`, and import fixtures or
validators directly from their owning modules. Keep unrelated checks in
separate ownership suites, and add runner behavior coverage to
`scripts/self-test/runner.test.mjs` when changing discovery or reporting.

Version-2 contracts also declare immutable `phase`, `workArea`, and
`routingRuleId` values. Agent governance verifies that the assigned agent is the
route lead, required route reviewers are present, and the task links a durable
GitHub issue. Newly introduced non-synthetic contracts use version 2; existing
contracts remain valid as legacy records.

The governance checks also fail closed on an unresolved base revision, compare
security-sensitive registry, routing, and activation-policy fields with the
trusted base, bind version-2 tasks to route ownership, and bind handoff actors to
sender and recipient transitions. Evidence references reject free-form values,
unsupported URI schemes, missing files, repository escapes, invalid Markdown
anchors, and symlinked path components. Activation evidence kinds are bound to
appropriate artifact classes, and accepted or completed handoff evidence is
bound to each expected output. Mandatory Product Owner and production-authority
requirement gates cannot be weakened by candidate policy data. Foundational
route selectors and governed source prefixes prevent coordinated work-area
relabeling.

Agent Skills under `.github/skills/<name>/SKILL.md` are reusable procedures, not
roles or approval authorities. `pnpm verify:skills` checks discovery metadata,
required sections, fenced Markdown parsing, repository-confined resource links,
registered invocable route leads, route-bound capabilities, policy-defined and
context-bound artifacts, EDD transitions, route and transition approval gates,
canonical verification, self-approval, and production-deployment prohibitions.
Required skill scenarios must also appear as named passing self-test assertions.
Skills reuse task contracts, routing, handoffs, and EDD evidence rather than
defining a parallel workflow.

## Layout

- `schemas/`: machine-readable contracts.
- `requirements/`: stable governed requirement references and lifecycle states.
- `handoffs/`: structured repository-neutral work-transfer records.
- `tasks/`: repository-neutral example and active assignment contract.
- `policies/`: protected paths, evidence gates, generated paths, secret patterns.
- `fixtures/`: explicitly synthetic deterministic data.
- `graders/`: deterministic architecture, secret, and documentation checks.
- `scripts/`: contract, policy, self-test, and canonical verification executors.
- `reports/`: generated local/CI evidence, excluded from source control.
