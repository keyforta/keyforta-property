# Product-owner agent operating guide

The machine-readable registry, routing matrix, requirement lifecycle, handoff
schema, and activation policy are described in
`FULL_LIFECYCLE_AGENT_SYSTEM.md`. They are authoritative for agent governance;
this guide is the Product Owner workflow.

## Standard workflow

1. Select an unchanged requirement from `docs/product/PRD.md` or its linked source.
2. Open a GitHub issue using the engineering-task template and reference exact sections.
3. Ask **Product and Requirements Analyst** to validate scope and report gaps.
4. Copy `harness/tasks/repository-neutral-example.json`, assign a task ID, and fill every field.
5. Choose one implementing agent; name independent reviewers for risk areas.
6. Add only necessary supporting agents and dependencies.
7. Set narrow `allowedPaths`; list protected paths and approved exceptions explicitly.
8. Obtain issue/task approval, create a focused branch, then begin implementation.
9. Run focused tests after the first edit and `pnpm verify` before review.
10. Keep generated evidence in `harness/reports`; summarize reproducible commands in the PR.
11. Ask QA plus architecture/security/SRE reviewers appropriate to risk; the implementer cannot approve.
12. Treat correctness, scope, security, data loss, isolation, and gate failures as blockers; label optional improvements recommendations.
13. Address requested changes within contract scope; revise and reapprove the contract before widening scope.
14. Product owner confirms acceptance criteria and unresolved risks.
15. A human merges after required checks and reviews; agents do not merge this workflow automatically.
16. Validate staging/dev through the release checklist and immutable SHA evidence.
17. Production requires a separate approved plan, environment approval, and explicit human dispatch.
18. Roll back application traffic to a verified revision; use forward database correction unless recovery is approved.
19. During incidents follow the relevant runbook, preserve evidence, contain, communicate, recover, and add regression coverage.
20. Activate deferred agents only through the gate in `DEFERRED_AGENTS.md`.
21. Update agents/instructions through a dedicated contract, harness self-test, independent review, and product-owner approval.
22. Run `pnpm verify:agents` after registry, routing, requirement, handoff, prompt, or activation changes.

## Reusable prompts

- `/lifecycle-intake` validates traceability and exposes decisions before work.
- `/route-approved-work` selects registered invocable specialists and gates.
- `/prepare-agent-handoff` creates a bounded machine-readable transfer.
- `/release-readiness` assesses evidence without deploying.
- `/incident-evidence` structures response evidence without changing production.

Prompt output is a proposal until the relevant human approves it. Reinvoke the
workflow after external approval; agents do not poll GitHub or retain process
state outside durable artifacts.

## Repository-specific examples

- **Approved feature:** reference an existing PRD acceptance criterion, assign frontend/backend as needed, require contract/API/isolation tests, and keep product text unchanged.
- **Defect:** reference the failing behavior and regression, authorize only owning code/tests/docs, reproduce first, fix, and retain a focused regression test.
- **Security remediation:** Security Reviewer reports the threat and severity; an implementer fixes it; QA independently proves exploit denial and no cross-org regression.
- **Architecture change:** Architect documents measured pressure and alternatives in an ADR; owner approves before implementation; architect does not approve its own code.
- **Infrastructure update:** Platform/SRE supplies Bicep what-if, cost, identity, rollback, and runbook evidence; no resource is provisioned by the implementation PR.
- **Production incident:** use `docs/operations/RUNBOOKS.md`, preserve correlation/release evidence, restore a validated revision, and open a separate corrective issue.

When an agent reaches an approval gate, it stops and presents the decision, options,
evidence, risk, owner, and reversible next action. Silence is not approval.
