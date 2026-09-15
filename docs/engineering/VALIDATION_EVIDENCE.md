# Engineering system validation evidence

## Scope

This record contains task-specific validation sections. It records local
evidence plus explicitly identified external actions. No deployment or cloud
resource was changed.

## ENG-006 task-contract metadata classification

Task `ENG-006` treats files under `harness/tasks/` as task metadata rather than
governed source when determining work-area ownership. Governance ownership
continues to apply to harness scripts, policies, schemas, and agent guidance.

### Results

The focused self-test verifies that adding a task contract does not relabel the
work area inferred from changed source files. Route ownership and protected-path
checks remain unchanged.

## ENG-007 EDD and GitHub control boundary

Task `ENG-007` makes `verified` the terminal EDD state, removes checkout
comparisons for descriptive commit and branch metadata, and removes internal
review, approval, and release evidence fields. Changed-file inventory, failed
and skipped check reporting, automated security checks, artifact validation, and
the three-cycle repair limit remain enforced. GitHub required CI checks,
pull-request reviews, CODEOWNERS or rulesets, branch protection, merge controls,
protected environments, and deployment approvals remain external controls; no
agent receives merge or deployment authority.

### Results

`pnpm verify:skills` passed for all 14 project skills. `pnpm
harness:self-test` passed 143 deterministic assertions with one intentional
offline external-system skip. Coverage includes checkout-independent metadata,
terminal `verified`, legacy approval-field rejection, changed-file inventory,
failure propagation, non-waivable automated security checks, external GitHub
control ownership, and maximum repair cycles.

`pnpm verify` passed repository policy, task and classification validation,
evidence and transition validation, formatting, lint, type checking, tests,
production builds, architecture and documentation graders, secret-pattern
checks, required scenarios, and all six Bicep compilations.

### Coverage

The harness exercises positive and adversarial paths for terminal-state
evidence, legacy field rejection, changed-file inventory, failure propagation,
artifact binding, and repair-cycle enforcement.

### Security

Secret-pattern and production dependency checks remain mandatory automated
gates. Authentication, authorization, tenant isolation, and data handling are
unchanged.

### Accessibility

No user interface behavior changes. The canonical accessibility gate remains
explicitly reported according to the available repository tooling.

### Architecture

The modular-monolith boundaries and dependency rules remain unchanged and pass
the architecture grader.

### Infrastructure

No infrastructure behavior changes. All six existing Bicep files compile
successfully.

### Repair cycle 1

Pull-request CI run `34707235763` passed source, test, build, and infrastructure
gates but failed final evidence validation because a verified task did not
generate its required `verification-report` artifact. The bounded correction
adds terminal artifact generation and a regression assertion. No source or
GitHub control was weakened.

### Repair cycle 2

Pull-request review found that a schema-valid contract could reach `verified`
without declaring the validation document needed for its terminal
`verification-report`. Contract validation now rejects that state history, and
the focused harness covers the omitted-evidence case.

## ENG-004 verifier retirement

This section is a historical record. Its exact-commit and post-verification
requirements were superseded by `ENG-007` and GitHub issue #35.

Task `ENG-004` removes the custom Trusted EDD workflow, hash manifest, source
binding, and rotation branches from normal CI. The canonical verifier and
exact-commit evidence generation remain. GitHub pull-request reviews are the
sole approval source; GitHub currently reports zero required approvals, so this
is an accepted human-policy limitation rather than an enforced merge gate.

The focused harness passed 43 deterministic assertions with one intentional
external-system skip. `pnpm verify` then passed repository policy, task and
classification validation, transition checks, formatting, lint, type checking,
tests, builds, and all six Bicep compilations. Exact-commit pull-request CI and
independent review remain required before merge.

Independent review found that removing `HARNESS_BASE_REF` would make general
change-scope validation fall back to mutable `origin/main`. The exact pull
request base SHA was restored and is covered by a deterministic workflow
assertion; it is independent of the retired trust-rotation mechanism.

GitHub workflow ID `356064261` (`Trusted EDD verifier`) was manually disabled
after the base-owned workflow failed the pull request that deletes it. Normal
`CI / validate` remained active and passed on commit
`6920c10d3eff0a94b523bf5886df10d160d53fec`.

## ENG-003 lifecycle extension

Task `ENG-003` extends the repository governance foundation with
machine-readable agent identity, lifecycle, routing, requirement, handoff, and
activation controls. It does not change functional requirements, runtime
behavior, infrastructure, deployment, or external GitHub settings. Its current
integration baseline is merge commit
`03e4e09185e6fd624987e31dd7a76e8e8a076fdc`, which includes the verifier
retirement from PR #29.

## ENG-002 engineering-system foundation

## ENG-002 results overview

### ENG-003 lifecycle extension

| Check                            | Result         | Evidence                                                                                                                                                                                                                                                             |
| -------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-change canonical baseline    | Passed         | `pnpm verify` passed at merged baseline `79da300dd5ea275c0d094e0c60e28f04c4c23fd2`                                                                                                                                                                                   |
| Task contract and classification | Passed         | `ENG-003` validates at `verification-ready`; configuration classification accepts the changed paths                                                                                                                                                                  |
| Repository policy                | Passed         | All changed paths are allowed and protected paths are declared; GitHub review remains external                                                                                                                                                                       |
| Agent governance                 | Passed         | 25 registered agents, 12 routes, 3 governed requirements, and the repository-neutral handoff validate                                                                                                                                                                |
| Harness self-test                | Passed         | 91 deterministic assertions passed; repository approval records are inert, lifecycle and routing policy cannot be weakened through duplicate or unregistered entries, synthetic exemptions are path-bound, and version-2 contracts are checked by focused validation |
| Editor diagnostics               | Passed         | No diagnostics in the new validator or modified harness entry points                                                                                                                                                                                                 |
| Canonical verification           | Passed locally | `pnpm verify` passed with 91 assertions, including GitHub approval ownership, activation and routing drift, agent allowlist, exact governance-path ownership, and version-2 task checks; exact-SHA evidence remains a clean CI responsibility                        |
| Verifier retirement dependency   | Passed         | PR #29 is merged into the branch baseline; ENG-003 does not restore the retired verifier, hash manifest, source binding, or rotation protocol                                                                                                                        |

Human approval, exact-commit CI, merge, and deployment are not performed by this
task. GitHub pull-request reviews remain the sole approval source.

### ENG-005 Agent Skills layer

| Check                       | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill discovery             | Passed | 14 project skills discovered under `.github/skills/<name>/SKILL.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Skill governance            | Passed | Metadata, required sections, resources, agents, capabilities, EDD transitions, approval gates, and prohibited actions validate                                                                                                                                                                                                                                                                                                                                                                                                        |
| Harness self-test           | Passed | 144 deterministic assertions passed and one external-system evaluation was explicitly skipped from a clean checkout without a pre-existing ignored reports directory, including dependency evidence generation, task-bound review provenance, generic HTML-inert evidence, strict skill metadata, comment-safe section parsing, multiline production-action detection, executable required-scenario failure, semantic artifact binding, route-capability binding, resource confinement, URI schemes, and indirect safety bypass cases |
| Focused verification        | Passed | `pnpm verify:skills`, `pnpm verify:task`, and `pnpm verify:classification` passed locally                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Workflow execution boundary | Passed | No product workflow, merge, deployment, or production action was executed                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

#### Dependency impact

The only added package is the development-only `yaml` parser used by the
repository-local skill validator. It is not bundled into the API or web runtime,
does not change production behavior, and can be rolled back with the Agent Skills
validator. The lockfile records the exact resolved dependency graph.

#### Security review

Reviewer: Security and Privacy Reviewer

Verdict: PASS

Review reference: https://github.com/cmbuyamba/keyforta-property/issues/30#issuecomment-5643483458

Security-focused adversarial testing exercises malformed YAML, mixed Markdown
fences, route and capability substitution, unrelated artifacts and approval
gates, external URI schemes, symlink traversal, approval-record misuse,
verification bypass, self-approval, multiline production-action paraphrases,
task-bound GitHub review references, and hidden content in Markdown comments,
fences, custom elements, and namespaced HTML. Prior review findings
were retained and corrected; the linked independent review passed this bounded
code and security-artifact slice. CI remains responsible for the network-backed
production dependency audit and GitHub remains the approval authority. Human
direction to continue this bounded correction after repair cycle three is recorded in
<https://github.com/cmbuyamba/keyforta-property/issues/30#issuecomment-5643394050>.

Exact-commit CI and independent GitHub review remain pending. Repository skill
records are procedural guidance and never authenticate approval.

### ENG-002 historical foundation

| Check                      | Result                       | Evidence                                                                                                            |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Pre-change baseline        | Passed                       | `pnpm check` completed before implementation                                                                        |
| Harness self-test          | Passed                       | Forty-one deterministic assertions passed; the intentionally offline external-system evaluation was labeled skipped |
| Canonical verification     | Passed                       | `pnpm verify` completed on 2026-09-11 and wrote ignored machine evidence to `harness/reports/verify-latest.json`    |
| Test suites                | Passed with environment skip | 124 tests passed; 18 PostgreSQL integration tests skipped because `DATABASE_URL` was absent locally                 |
| Dependency audit           | Required in CI               | Local offline verification skips mutable advisory data; replacement CI must enforce the production audit            |
| Production build           | Passed                       | API, contracts, domain, and Next.js web build completed                                                             |
| Infrastructure compilation | Passed                       | All six Bicep files compiled with the installed Azure CLI                                                           |

The canonical run also passed repository policy, task-contract validation,
formatting, lint, type checking, architecture boundaries, secret-pattern
scanning, documentation-impact grading, and harness self-testing.

The EDD task, classification, and current-state commands pass. Exact-commit
manifest generation is intentionally skipped in the dirty local worktree and is
required from the clean pull-request CI checkout before this task may advance to
`verified`.

Human approval belongs to GitHub pull-request reviews, CODEOWNERS, branch
protection or rulesets, and protected environments. Repository verification
does not authenticate approval comments. Required approvals were not confirmed
for this repository and are tracked as an accepted governance gap. Pull-request
code has read-only permissions and cannot approve or merge.

## Failures found and corrected

1. Repository policy rejected `README.md` because the active contract omitted it
   from `allowedPaths`. The contract now explicitly includes that file.
2. Formatting rejected 37 new or edited supported files. The repository Prettier
   configuration was applied, and the complete verification then passed.
3. The first pull-request CI run could not resolve `origin/main` from the
   default shallow checkout, so repository policy stopped before later gates.
   CI now fetches full history; workflow YAML, repository policy, and
   `pnpm verify` passed locally after the correction. The replacement CI run
   passed remotely.
4. Pull-request review found that contract selection, protected-path approval
   wording, declared commands/scenarios/evidence, architecture import coverage,
   runner failure testing, and database environment validation were incomplete.
   The harness now fails closed or records the external human gate for each case.
5. Follow-up review found that branch pushes could lack a unique contract,
   evidence checks accepted stale files, failed runs omitted later skipped gates,
   and local verification depended on mutable registry data. Push verification
   now skips only contract-bound gates, generated evidence is tied to the current
   passing run, later gates are explicit skips, and dependency audit is CI-only.

These failures were introduced by this change and fixed without weakening a gate.

## Skipped or deferred checks

- Browser accessibility automation is skipped because the repository has no
  approved accessibility runner. Semantic review remains manual; tool selection
  is tracked in `REQUIREMENTS_GAPS.md`.
- Local PostgreSQL integration is skipped without `DATABASE_URL`. CI provisions
  PostgreSQL and must run this suite before merge.
- External-system evaluation in the harness self-test is intentionally skipped;
  the fixture is repository-neutral and offline.
- Local dependency auditing is skipped because advisory data is network-backed
  and mutable; CI continues to enforce the production audit.
- OpenTelemetry runtime instrumentation and formal SLO approval remain deferred
  decisions. Documentation does not claim that either exists today.

## Required review evidence

Before merge, attach the successful CI run for the immutable commit, confirm the
PostgreSQL suite ran rather than skipped, resolve independent architecture,
security/privacy, QA, SRE, and pull-request review blockers, and record product
owner acceptance. Deployment remains a separate human-approved workflow.
