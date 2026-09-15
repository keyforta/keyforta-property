# Engineering governance

## Authority and structure

Functional authority is `docs/product/PRD.md` and linked product documents.
Architecture decisions live in `docs/architecture/adr`; operational authority
lives in `docs/operations`; AI policy lives in `docs/ai`. `AGENTS.md` is the
binding engineering agreement, `.github/copilot-instructions.md` is repository
Copilot guidance, path instructions specialize it, and task contracts bound each
change. More specific guidance may add constraints but may not weaken a higher
level.

Task contracts declare protected paths but cannot attest to their own approval.
The repository owner uses GitHub pull-request reviews and CODEOWNERS as the sole
approval source. GitHub currently reports zero required approvals, so
protected-path approval remains a voluntary human merge policy until branch
protection or rulesets can enforce it. The harness does not duplicate or
authenticate that decision.

Agent identity, lifecycle, capabilities, routing, activation, and handoffs are
governed by the machine-readable sources listed in
`FULL_LIFECYCLE_AGENT_SYSTEM.md`. Deferred, experimental, and retired agents are
not invocable. Registry changes remain protected decisions and cannot attest to
their own approval.

Deployables stay in `apps`, pure shared rules and contracts in `packages`, schema
and Azure implementation in `infra`, deterministic engineering enforcement in
`harness`, and evidence-based guidance in `docs`. The MVP remains a modular
monolith. Extraction requires measured independent scaling, ownership, security,
reliability, or deployment need, an ADR, and human approval.

## Approval gates

Agents stop for approval before changing functional requirements or MVP scope,
introducing a service or replacing the stack, adding paid services, changing auth
or authorization, data ownership/retention, destructive migrations, payment
boundaries, security/quality controls, protected harness policy, deferred-agent
activation, production infrastructure, or production deployment. Implementers
cannot approve their own architecture, security, QA, or pull request evidence.

## Definition of done

An approved issue and valid task contract exist; scope and protected paths pass;
acceptance, negative, authorization, and isolation evidence is present as
applicable; documentation and rollback are current; and `pnpm verify` passes
with skips explained. EDD then ends at `verified`. GitHub required checks,
pull-request reviews, CODEOWNERS or rulesets, branch protection, and merge
controls govern integration; protected environments and deployment approvals
govern promotion. Merge and deployment remain human actions.

## Azure conventions

Use reviewed Bicep modules, environment parameters, deterministic names/tags,
managed identities, federated deployment identity, secure parameters, least
privilege, exact-SHA images, what-if evidence, forward migrations, rollback
instructions, diagnostics, backup/restore evidence, and cost ownership. Existing
pilot cost choices are documented in ADR-0006/0007. New paid resources require an
estimate and approval; this engineering-system task provisions nothing.

## Recommended repository protections

These settings require repository-owner approval and are recommendations, not
claims about current GitHub configuration:

- protect `main` from direct pushes and force pushes;
- require the `CI / validate` check on the exact pull-request commit;
- require at least one approval and fresh CODEOWNERS approval after changes;
- dismiss stale approvals and require all review conversations to be resolved;
- require signed commits or vigilant-mode verification where team identity
  operations support it;
- keep GitHub secret scanning, push protection, and dependency alerts enabled;
- allow deployment only through protected environments with human approval; and
- prefer squash merge so one reviewed outcome maps to one immutable merge SHA.
