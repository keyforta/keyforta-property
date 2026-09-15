# Full product lifecycle agent system

## Authority and boundaries

This system extends the engineering foundation without changing product
requirements or runtime behavior. The Product Owner retains final authority over
scope, priority, acceptance, activation, merge, and deployment. GitHub
CODEOWNERS, branch protection, required reviews, and protected environments are
the approval boundary; repository records provide audit and consistency evidence
but do not authenticate approval.

The machine-readable sources are:

- `harness/policies/agent-registry.json` for identity, lifecycle, capabilities,
  prohibitions, and activation gates;
- `harness/policies/agent-routing.json` for phase and work-area ownership;
- `harness/policies/agent-activation.json` for allowed lifecycle transitions;
- `harness/requirements/agent-foundation.json` for governed requirement IDs,
  versions, states, and sources; and
- `harness/schemas/handoff.schema.json` plus `harness/handoffs/` for bounded
  transfers of work.

Custom-agent frontmatter remains necessary for VS Code invocation, but it is not
the governance authority. `pnpm verify:agents` detects drift between invocable
definitions and the registry.

## Lifecycle

| Phase                       | Primary outcome                                 | Default owner                                | Human decision                                   |
| --------------------------- | ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| Discovery and requirements  | Traceable approved scope or a documented gap    | Product and Requirements Analyst             | Product Owner approves scope                     |
| Design                      | Bounded design, tradeoffs, and rollback         | Solution Architect or UX UI Product Designer | Consequential decisions require approval         |
| Implementation              | Contract-bounded changes and tests              | Routed specialist                            | Approved task contract                           |
| Verification                | Reproducible acceptance and regression evidence | QA and Test Engineer                         | Unresolved failures block progress               |
| Independent review          | Findings, independence, and residual risk       | Pull Request Reviewer and risk specialists   | GitHub required review                           |
| Documentation and readiness | Current operating and product-owner guidance    | Technical Writer                             | Product Owner accepts outcome                    |
| Release and operation       | Release evidence, observation, incident support | Azure Platform and SRE Engineer              | Explicit human dispatch and environment approval |

The MVP Engineering Orchestrator coordinates these phases. It may delegate to
registered invocable custom agents when the platform supports subagent calls. It
cannot persist between sessions, subscribe to events, poll for approvals, merge,
deploy, approve, or make high-impact product decisions. A human must re-invoke
the workflow after an external gate and supply the durable repository or GitHub
reference that resumes it.

## Agent lifecycle classes

- `core`: routinely required governance or review capability.
- `on-demand`: invocable only for an approved task needing that specialty.
- `deferred`: cataloged but not invocable; no custom-agent definition exists.
- `experimental`: isolated evaluation only and never production authority.
- `retired`: historical identity retained for evidence resolution, not routing.

Activation is a protected registry transition. It requires an approved task
contract, demonstrated capability need, an agent definition with narrow tools,
appropriate risk review, deterministic verification, and external GitHub review.
Activation cannot silently expand MVP scope. Experimental promotion additionally
requires evaluation results and a safe fallback. Retiring a role requires a
replacement owner and preservation of historical references.

The validator compares the base-revision registry, routing matrix, and
activation policy with the candidate revision. Lifecycle changes require an
activation record; capability, prohibition, routing, and activation-policy
changes require a governance change record with durable evidence references.
These records expose drift for review but remain unauthenticated audit claims.
Only the external GitHub controls above establish approval. Base revision lookup
fails closed, while a governance file absent from a valid base is treated as an
initial introduction.

Activation evidence is stored as `{ kind, reference }` records. Each transition
requires exactly one record for every required kind, and high-impact kinds such
as task approval, agent definition, risk review, and verification are restricted
to their corresponding artifact classes.

## Requirements and handoffs

Governed requirement records reference authoritative text instead of copying it.
IDs and versions are immutable. Editorial source changes do not alter historical
evidence; a behavioral change requires Product Owner approval and a new version
or ID. Splits create new IDs and mark the old version superseded rather than
deleting or reusing it. Existing free-form task references remain valid for
backward compatibility; new governance work should use stable IDs when one
exists.

A handoff names distinct sender and recipient agents, the task, inputs, typed
expected outputs, output-bound evidence, status, and human gate. `ready` means the
recipient has enough bounded context to act. `accepted` and `completed` require
durable repository or HTTPS evidence. The sender records `proposed` and `ready`;
the recipient records `accepted`, `rejected`, and `completed`. Every local
reference is resolved through its real path and cannot traverse a symlink or
escape the repository. A handoff never transfers approval authority and cannot
make the implementer its own independent reviewer.

Version-2 task contracts bind immutable `phase` and `workArea` values plus
`routingRuleId` to `assignedAgent`, required route reviewers, and a durable
GitHub issue URL. Newly introduced non-synthetic contracts must use version 2;
legacy contracts remain valid so existing evidence is not rewritten.
Canonical selectors for the foundational routes and ownership of application,
infrastructure, and harness path prefixes are enforced by the governance
validator, so coordinated policy edits cannot relabel one work area as another.

Every requirement transition requires evidence. Transitions into approval,
acceptance, deferral, supersession, or rejection retain Product Owner authority;
release retains production-authority review. Candidate policy data cannot weaken
these decision gates.

## Deferred decisions

This foundation does not decide or activate retention periods, formal numerical
SLOs, AI providers or features, production topology, paid services, legal policy,
live payment operations, autonomous rollback, or deployment. It does not change
GitHub settings. Those decisions require separate approved work and the owners
identified in existing governance and requirements-gap records.

## External control checklist

Repository owners should verify outside pull-request code that `main` rejects
direct and force pushes, exact-commit CI is required, CODEOWNERS review is fresh
after protected changes, stale approvals are dismissed, review conversations are
resolved, and protected environments require explicit human approval. Evidence
should link the GitHub control or review without copying tokens, secrets, or
personal data into the repository.
