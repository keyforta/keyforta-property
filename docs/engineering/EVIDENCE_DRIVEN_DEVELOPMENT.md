# Evidence-Driven Development

Evidence-Driven Development (EDD) is the repository's mandatory engineering
workflow. Narrative claims such as "implemented", "tested", "secure", or
"complete" do not advance a task. Only reproducible, structurally valid evidence
can satisfy a gate.

## Workflow

The normal sequence is:

`proposed` -> `analyzed` -> `approved` -> `designed` ->
`implementation-ready` -> `implemented` -> `verification-ready` -> `verified`

No normal state may be skipped. A task may enter `blocked`,
`changes-requested`, `rejected`, or `superseded` from an active state when a
structured state-change record identifies the reason, actor, timestamp, and
evidence. `verified` is the terminal EDD state. Pull-request review, acceptance,
merge, release, deployment, and rollback are external repository or operational
activities, not EDD states. The executable transition and prerequisite
definitions live in `harness/policies/evidence-gates.json`.

Human approvals belong to GitHub pull-request reviews, CODEOWNERS or rulesets,
branch protection, merge controls, protected environments, and deployment
approvals. The harness does not authenticate or duplicate those controls and
does not receive merge or deployment authority while executing pull-request
code.

Pull-request CI validates the policy and implementation in the checked-out
commit. Policy changes require explicit protected-path scope and human review in
GitHub. The repository does not maintain a second hash manifest, source pull
request, or exact-head approval-comment protocol.

Changes to EDD policies, schemas, scripts, graders, or CI enforcement workflows
require explicit protected-path scope in the task contract. Any required review
or approval is enforced through GitHub rather than an EDD artifact. GitHub
currently reports zero required pull-request approvals, so review remains a
human merge policy until repository settings can enforce it.

## Task contract

Every task has one contract under `harness/tasks/`, validated by
`harness/schemas/task-contract.schema.json`. It records the issue or approved
exception, requirement references, classification, current state, responsible
agent, supporting reviewers, acceptance criteria mapped to tests, technical
decisions, affected paths, risks, rollback, approval requirements, and
repair-cycle count.

Classification is one of `feature`, `bugfix`, `refactor`, `security`,
`infrastructure`, `configuration`, `documentation`, `dependency`, `operational`,
or `emergency`. `verify:classification` compares that declaration with the Git
diff. A documentation task fails if it changes runtime code, infrastructure,
migrations, workflows, security configuration, or protected harness policy.
Other classifications enforce their required path families and evidence defined
in the policy. Lockfile and dependency-manifest changes require `dependency`
classification and cannot be hidden inside `configuration` changes.

## Evidence manifest

CI generates `harness/reports/evidence-<TASK-ID>.json` from a clean checkout. The
manifest follows `harness/schemas/evidence-manifest.schema.json` and contains:

- task, issue, requirement, classification, state, and descriptive branch and
  commit metadata;
- the exact changed-file inventory and responsible agent;
- tool/runtime versions, commands, timestamps, and exit codes;
- tests, coverage applicability, security, accessibility, architecture, and
  infrastructure results;
- hashed artifact records and screenshots or traces where applicable;
- failures, waivers, rollback data, and repair-cycle count;
- requirement-to-verification traceability, including acceptance-test mappings.

The validator compares the changed-file inventory to Git and validates the
manifest against the active contract. It does not compare descriptive branch or
commit metadata with the checkout. It rejects mismatched files, missing
commands, failed/skipped required results, invalid timestamps, template text,
hash mismatches, incomplete requirement-to-verification traceability, expired
waivers, and non-waivable gates. A screenshot can supplement command or test
evidence but cannot replace it.

Artifact records reference regular files inside the repository workspace and
must match their recorded SHA-256 hashes. Required sections must be carried by a
required artifact kind; unrelated records and unverifiable external references
cannot satisfy a transition.

Durable Markdown evidence for a new task lives at
`docs/engineering/evidence/<TASK-ID>.md` and is declared by that task contract.
This keeps concurrent tasks from mutating a shared evidence document. Legacy
contracts present when this rule was introduced may retain their existing shared
evidence reference until explicitly migrated; new tasks cannot select it, and a
verified task cannot declare both forms.

Generated manifests are ignored locally and retained by CI as run artifacts for
30 days. Durable contracts, decisions, and waivers remain in version control;
reviews, approvals, merge status, and deployment status remain in GitHub.
Evidence must never include secrets, tokens, production exports, payment data,
or unnecessary personal data.

## Commands

- `pnpm verify:task` validates the active task contract.
- `pnpm verify:agents` validates agent registry, routing, requirement lifecycle,
  handoffs, activation rules, definition completeness, and separation of duties.
- `pnpm verify:classification` compares classification with the Git diff.
- `pnpm verify:evidence` validates the generated manifest, changed-file
  inventory, and referenced artifacts.
- `EDD_TRANSITION_TO=<state> pnpm verify:transition` evaluates a requested state
  transition. Without a target it validates the declared current state.
- `pnpm verify:all` runs the canonical engineering and evidence gates.
- `pnpm verify` is an alias for `verify:all` and is the CI entry point.

Local verification with uncommitted implementation can generate and validate
evidence. Pull-request CI independently runs the canonical checks and retains
all reports. GitHub required checks, reviews, branch protection or rulesets, and
merge controls remain authoritative after EDD reaches `verified`.

## Waivers and repair

A waiver must identify its gate, reason, risk, impact, named human approver,
approval and expiration timestamps, compensating controls, follow-up work, and
pull request. Agents cannot approve waivers. Secret-pattern and dependency-audit
checks are never waivable. Waiver records are audit context only: they never
suppress failed or skipped automated checks, missing artifacts, or missing
artifact sections. Exceptions to GitHub review, migration approval, or
environment controls are managed outside EDD.

On verification failure, preserve the failed report, move the task to
`changes-requested`, make one bounded correction, increment `repairCycle`, and
regenerate evidence before repeating verification. No more than three automated
repair cycles are allowed. A fourth attempt is denied; the task becomes
`blocked` and requires human direction.

## Claim traceability

Each acceptance criterion must connect requirement -> issue -> task contract ->
technical decision -> changed files -> tests/manual check -> verification ->
verified. Security-sensitive changes also reference threat-model evidence and
retain automated secret-pattern and dependency-audit checks. Operational
planning can reference rollback, monitoring, and runbook evidence, but GitHub
and protected environments own review, merge, and deployment decisions. Missing
EDD links deny the relevant transition.
