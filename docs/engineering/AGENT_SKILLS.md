# GitHub Copilot Agent Skills

## Purpose

Project skills in `.github/skills/<skill-name>/SKILL.md` package repeatable
procedures for GitHub Copilot. Agents remain the governed identities that own
capabilities, restrictions, and authority. Skills do not create roles, approve
work, activate deferred agents, merge, or deploy.

Every skill uses the existing task-contract, routing, handoff, EDD, and harness
mechanisms. The registry and routing matrix decide who may act; GitHub controls
remain the approval boundary. `pnpm verify:skills` validates the catalog, and
`pnpm verify` remains canonical.

## Catalog

| Skill                   | Use it by asking                                                            |
| ----------------------- | --------------------------------------------------------------------------- |
| `discover-capabilities` | "Discover which governed capabilities can handle this request."             |
| `route-work`            | "Route this approved issue to the correct lead and reviewers."              |
| `discover-product`      | "Discover the current product behavior for tenant applications."            |
| `define-requirement`    | "Define a traceable requirement from this approved product need."           |
| `refine-requirement`    | "Refine this requirement after review without losing history."              |
| `assess-impact`         | "Assess architecture, security, data, and rollback impact for this change." |
| `design-experience`     | "Design the responsive and accessible experience for this approved flow."   |
| `plan-feature`          | "Plan this approved feature with requirement-to-test traceability."         |
| `implement-feature`     | "Implement this feature from its implementation-ready task contract."       |
| `fix-defect`            | "Reproduce and fix this defect with a regression test."                     |
| `review-change`         | "Review this verified change independently for correctness and risk."       |
| `verify-evidence`       | "Verify the evidence and canonical gates for this implementation."          |
| `prepare-release`       | "Prepare release and rollback evidence without deploying."                  |
| `investigate-incident`  | "Investigate this incident and prepare a human-owned response decision."    |

## Discovery and Validation

GitHub Copilot discovers skills from their `name` and `description` frontmatter.
The folder and name must match. Descriptions state concrete use cases so agents
can load only the relevant procedure.

Each skill declares required inputs, procedure, authorized route-lead agent IDs,
route-bound capabilities, policy-defined artifacts, EDD transitions, route and
transition approval gates, evidence, escalation, prohibitions, completion
criteria, and links to shared resources. Reviewers remain reviewers and cannot
acquire execution authority through a skill. Referenced scripts, schemas,
policies, templates, and documentation remain authoritative; skills link to
them instead of copying them.

Run:

```bash
pnpm verify:skills
pnpm harness:self-test
pnpm verify
```

Validation fails for duplicate names, malformed metadata or Markdown fences,
missing sections, external or unsafe resources, unknown or inactive agents,
non-lead execution owners, unknown artifacts or gates, unsupported EDD
transitions, missing transition artifacts or approvals, canonical-verification
bypass, self-approval, and permission to deploy to production.
The canonical verifier also requires every contract-declared skill scenario to
appear as a named passing assertion in the generated self-test report.

## Operating Boundary

Invoking a skill does not advance task state by itself. The responsible agent
must update the task contract and evidence, use a structured handoff when
ownership changes, run the required checks, and stop at every human gate. No
skill may turn repository text into proof of approval.
