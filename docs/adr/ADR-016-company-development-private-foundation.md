# ADR-016: Isolated company-development private database foundation

**Status:** Proposed ADR, external human acceptance pending; staged local implementation specifically owner-approved (not activated)

**Date:** 2026-10-25 UTC

**Owners/reviewers required:** Platform, Network, Security, Finance, repository maintainers
**Scope:** New empty company DEVELOPMENT foundation only; never production

## Bounded current-authority evidence decision — 2026-10-26

**Approved procedural addendum; not full ADR acceptance.** At
**2026-10-26T21:54:07.875Z** the user replied **“go with option 2”** to:
“Change the company-dev requirement: explicitly approve an alternative evidence
policy that addresses the unreadable future-access risk while preserving least
privilege and deployment controls.” This approves policy selection, not merge,
deployment, observed schedules or owner approval of an unseen record; it
does not prefill operational review. Existing status and historical decisions
below retain their recorded meaning, subject only to this explicit exception.

**Decision:** procedural evidence mode
`companydev-retired-writer-current-authority-bounded` supersedes ONLY the full-schedule-proof obligation
in prior runbook/ADR handoff decisions for this exact destination and retired
bootstrap identity:

| Binding | Fixed value |
| --- | --- |
| Tenant | `8019a048-e7d6-48e8-984a-b902f641a21b` |
| Subscription | `891e5e6e-8ae3-4455-9184-8d7606223d91` |
| Resource group | `rg-keyforta-companydev-san` |
| Retired SP object / client | `e10f9e0f-274f-4643-8a8f-ad8f41b09c64` / `63b65efc-7e8d-4d82-b13a-53b875df54f1` |
| Named removed assignment to freshly verify absent | `3fcab962-b128-5c7c-a15a-84b290c06a6f` |

This is limited to the previously authorized bounded local security handoff:
four exact workload grants, approved-design Defender configuration and harmless
synthetic verification. It adds no production or operational scope. Current
assigned authority must be completely and freshly measured for the retired writer
and applicable original workflow caller; missing current visibility or equivalent
bootstrap/security/data authority still blocks. Preserve authenticated predecessor
and original-client runtime binding, current-caller/security/grant validation,
human Owner and preview/audit metadata-only access. No executable bypass, new
flag, schema or version is introduced: source profiles 5/6, functional record v2,
workflows and schemas remain unchanged.

**Residual risk — Unobservable future scheduled authority:** individually
unreadable eligible/active/future schedules remain UNKNOWN. Invisible authority
may become effective later, including during this bounded handoff. Fresh checks
reduce/detect visible exposure; they do not prove absence of future assignments.
The approved tradeoff is weaker future assurance, not complete revocation or
blanket permission to proceed when PIM is unavailable. The current-authority
gate stays intact; enforcement of this evidence alternative is procedural review,
not a claim that runtime code verifies all transitive or scheduled authority.

The [runbook's bounded mode and record checklist](../../infra/README.md#bounded-current-authority-evidence-mode--2026-10-26)
is authoritative for collection, individual UNKNOWNs, the narrow Microsoft-backed
eligible-SP N/A, the maximum 24-hour evidence-use window, revalidation/invalidation
and retained operational gates. Existing generated “ALL … PIM authority” summary
wording is read subject to this exception only as explained there; all other
destinations/identities/handoffs retain the ordinary full-proof rule.
Policy selection is not deployment readiness or a new execution authorization.

**Owner:** cmbuyamba, accountable Azure technical/risk owner; the authorized
operator collects and revalidates evidence, and repository maintainers own
documentation consistency. **Review triggers:** identity, scope, role definition,
group or assignment drift; missing current visibility; interrupted/resumed
execution; evidence expiry; changes to PIM observability, policy or handoff
controls. Refresh measurements/review under this same approved policy; no
arbitrary new human policy approval or automatic renewal is introduced.
**Rollback:** withdraw prospective policy and stop new use; preserve history and
evidence. Revert to ordinary proof requirements, with no automatic Azure writer regrant.

## Approval evidence and limits

In the human-directed planning session, the user selected: **“Approve the
private-network design and raise the planning ceiling to $120/month before tax;
continue deployment preparation.”** This authorizes preparation of this direction,
not execution, provider registration, RG creation, roles, federation, billing or
workflow activation. It is not evidence that this ADR has received required
repository/external reviews. No acceptance date or reviewer sign-off is invented.
CIDRs and the detailed NSG rules still require network/security-owner approval.

The user previously selected **“Approve independent manual verification while
retaining GitHub required-reviewer protection.”** This approves replacing the
unsupported automated admin-bypass assertion with the native protected-environment
review procedure, not provisioning authority, audit waiver or ADR acceptance.
That independent-review requirement is superseded by the subsequent decision below.

The subsequent **“I approve”** records conditional authorization for the agreed
foundation-only provisioning after all prior prerequisites genuinely pass.
The isolated plan-bound apply implementation below is now prepared for external
review, not activated. This consent does not waive audit/security/reviews,
network-owner/payer inputs, explicit human authorization or bootstrap authority;
no additional blanket authorization is requested. This ADR remains **Proposed**.

### Subsequent user-approved removal of independent review — 2026-10-26 UTC

In the current human-directed implementation session, the user explicitly
authorized removal of all independent review requirements, including
`company-dev` / `company-dev-apply` required reviewers in
`assertEnvironmentProtection`. This decision supersedes this ADR's prior
independent PR/environment-review, prevent-self-review and initiator/rerun-actor
separation requirements; it does **not** accept the full ADR or authorize
deployment, merge, activation, permission writes or GitHub settings changes.
The user reports live environments already have no required-reviewer rules;
this local implementation does not claim to have queried or modified them.

**Decision:** accept an empty actual protection-rule array for either environment.
Require actual positive environment ID/node ID, correct name, protected branches
and readable rule metadata. Snapshot all actual rules, including optional reviewer
settings, and reject any ID/rule/snapshot/run/SHA drift before OIDC. Missing rule
metadata is not equivalent to an empty inventory. No independent reviewer,
prevent-self-review setting, actor separation or native approval comment is a
prerequisite. Keep existing scoped preview/apply principal separation: that is
least privilege, not human reviewer separation.

**Consequences:** GitHub no longer supplies an independent environment approval
checkpoint for these routes. The authorized human operator remains accountable
for exact plan/scope review, explicit human merge/deploy authorization and manual
UI no-admin-bypass verification (not exposed by the documented environment API).
Context hashes, activation flags and dispatch inputs are not approval. Protected
main, latest exact-SHA green CI/security/DAST, immutable SHA/plan/artifact/digest
binding, fresh what-if/drift stops, network-owner approvals, external change
freeze, all security/permission/functional handoffs and financial gates remain.
No services, cost estimates, telemetry, backups/restore tests, SLO/error budgets
or rollback/runbooks change.

Regression evidence uses synthetic environment metadata and local fake CLI
transports, not external settings or deployments: empty-rule preview/apply with
the same initiator/rerun actor previously failed at “Environment requires external
reviewers”; they must now pass while branch/identity/snapshot and all existing
quality/drift/no-write-on-failure tests remain enforced. Historical artifact bytes
are not rewritten; new workflow/source hashes require a fresh exact-SHA preview.
Rollback is an explicitly authorized code revert and fresh plan; no automatic
environment-settings change or reuse of stale plans is authorized.

## Proposed staged company-foundation contract

### Approved bounded policy removal — 2026-10-26 UTC

For issue [#159](https://github.com/keyforta/keyforta-property/issues/159), the
owner explicitly said **“change those requirements... remove them”**, then
**“remove those 2 blockers”**. The approved scope is exactly (a) manual freeze/
UI-observation prerequisites for completion audit and (b) the separate manually
reviewed exact-SHA preview run/digest handoff prerequisite for apply.
This decision supersedes only those requirements in the historical text below;
the full ADR remains **Proposed**, not Accepted. It approves local implementation,
tests and publication, not a live audit, deployment, merge or permission/settings
change. Existing audit access is APPLIED and unchanged.

**Decision:** keep one explicit owner dispatch on the existing apply workflow,
ordered `preview_guard → plan → apply_guard → apply`. Reuse the existing preview
steps/identity/environment and separate writer steps/identity/environment.
Consume the immutable current-attempt plan artifact automatically using
`ordered-plan-apply-v1`, not manual PLAN/REVIEWED fields or a second dispatch.
The standalone preview remains preview-only. Current native workflow is in
progress; only the plan producer job/upload must already be successful.
Preserve strict completed-success semantics for historical standalone plans.

New evidence/input/inventory and checkpoint versions are 3; audit intent/receipt
are 2; current source profiles are 5 (plan/audit) and 6 (inspection). Historical
versions and exact workflow byte pins retain their old meanings. New producers
omit freeze/UI fields and new validators reject them. Source profiles bind exact
workflow blobs and closed changed paths, never wildcard workflows or a
self-referential manifest-file hash.

**Retained invariant:** a genuine authorized execution and successful plan must
precede any scoped apply; native protected-main/source/actor/attempt, latest
exact-SHA CI/security/DAST, authenticated archive/payload binding, separate
identities, live environment and fresh provider drift checks remain mandatory.
Current-attempt job metadata, fixed successful `needs`, upload artifact ID/digest
outputs, archive-by-ID hashing/bounded validation and temporal metadata form the
producer assurance. GitHub does **not** cryptographically attest artifact producer
job/attempt. Reauthenticate before writer sign-in and immediately before PUT.
No automatic second workflow dispatch, uncertain PUT retry or destructive
recovery is introduced.

**Consequences/risks:** there is no human plan-review pause or manual UI assurance.
Reject an observed API admin-bypass true value; absence is unobservable, not proof
of false. Human snapshot approval (`frozenSnapshotSha256`), fresh one-hour
pre-dispatch owner authorization, inspection reference, original archive
provenance, observer isolation, security/functional handoff and writer revocation
are **not removed**. Inspection cannot become a receipt/checkpoint or deployment
authority. No three-Modify/five-Delete override, Defender waiver, PIM inference or
full-stack readiness is approved. Original failed-run checkpoint stays false.

No cost/resource/paid-service changes: retain $108.35 estimate and $120/month
before-tax ceiling, telemetry, backup/restore-test, SLO/error-budget and runbook
requirements. Rollback is an authorized code revert and fresh exact-source
operation/plan, never stale artifact reuse, archive mutation or automatic live
settings reconciliation. See the [current infrastructure contract](../../infra/README.md#current-policy--approved-2026-10-26-prepared-code-only).

The heading retains the proposal's historical anchor. The current authorization
is [explicit Product Owner approval](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6402966949)
for local implementation/tests of this staged contract, including **both**
reserved decisions: temporary **empty, unused** bootstrap Storage before
Defender, and **human removal of all bootstrap workflow writer authority before
human grants/security handoff**, including inherited/equivalent authority.
Continuation must never regain UAMI/ACR/Storage write authority.
This does not constitute full external ADR acceptance, Azure permission
sufficiency, activation, dispatch, deployment or permission/settings writes.
No second Azure technical sign-off or independent GitHub review is required;
explicit human authorization remains mandatory. Earlier proposal-only statements below record
history, not the current implementation authorization.

The [specific subsequent owner decision](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6403538260)
approves the **local code/test contract** for owner-confirmed, correlated harmless
synthetic functional verification alongside actual readable settings/identity/
permissions, replacing the unobservable internal Storage→scanner→Event Grid
mapping requirement. Internal topology remains **UNVERIFIED**. It grants **no
execution/upload authority**; a future manual synthetic test requires separate
authorization. Mutable Blob index tags are not a sole security control or
automated foundation-ready/data-admission proof. Explicit human authorization remains.

### Review scope and evidence - 2026-10-25

Initially the user approved preparation of this minimal staged proposal for independent
review only: not implementation, deployment, permission writes or activation.
ADR-016 remains **Proposed**; no acceptance or security waiver is recorded.
Unchanged: $120/month before-tax ceiling, $108.35 estimate, not cost guarantees.
No extra services, paid components or source-dev changes.
cmbuyamba is the sole accountable Azure technical expert and owner.
No second Azure technical review/sign-off is required
to prepare infrastructure or assess the proposed Azure technical design.
Technical validation relies on reproducible tests/provider results.
AI may assist evidence/checks, not claim expertise or approve risk; cmbuyamba owns technical/risk decisions.
Incomplete evidence remains blocking; neither owner status nor AI assistance waives checks.
Independent PR/environment approvals are no longer required under the subsequent
decision above; human authorization/control checks remain, not Azure expertise
certification or duplicate technical review.
Augustin2K may review scope/operator intent and GitHub controls without Azure expertise.
Platform/Network/Security are responsibility roles, not additional Azure reviewers:
Platform owns permission proof and Network the existing network controls.
Both new security decisions required specific informed Product Owner approval,
now recorded in the implementation authorization above;
Finance retains the unchanged cost/offer gates.

At proposal time code was one-shot: empty RG, create-only full plan, six-file
artifact, one ARM submission, and all following stages were future proposals.
Apply remains unconfigured. The staged implementation and remaining external
unproven permission boundaries are enumerated in the acceptance map below.
[Historical review](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6402311737):
Augustin2K reviewed run `40223406509`, attempt `2`, artifact `12610233452`,
SHA `4066ce311d13ec06bdd60c04eb05bac15f24cb05`; parent confirmed main CI green.
Artifact expires `2026-11-01T19:12:40Z`; it is historical only and cannot be used
by either changed stage or version-2 apply.
[Feasibility finding](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6402526036):
exact future-principal role delegation is impossible under the considered scheme.
No workflow Owner/Contributor, `roleAssignments/write`, subscription scanner
writes or subscription-wide RG/Network writer is proposed.

### Stage 1 - bootstrap only

Create ONLY the three existing-design API/web/migration UAMIs, ACR, Storage
account, Blob service and private `tenant-applications` container: seven resources
plus ARM deployment records. No Network, PG, ACA, logs, Defender, assignments,
apps or jobs. Confirm names against the reviewed compiled template. Preserve
registry admin disabled, shared keys/public Blob access disabled,
OAuth, HTTPS/TLS 1.2+, private container and seven-day soft delete.
**Specifically owner-approved security decision:** temporarily empty, unused Storage without
verified Defender. No app attachment, uploads, data or migration; not foundation-ready.
**Specifically owner-approved handoff guard:** human removal of bootstrap workflow write rights
before Stage 2, proving no inherited/equivalent rights remain. Continuation cannot
rewrite UAMIs, ACR or Storage. Bootstrap type-scoped rights
can modify those types while active; they are not name-bound create-only rights.
Both this guard/tradeoff and the transient exception have specific informed
Product Owner approval at the reference above, not merely broad consent;
required GitHub gates remain. Neither decision authorizes uploads/data/use.

### Owner-directed local agent handoff decision — 2026-10-26

**Approved narrow policy delta, code/doc/test only:** at
**2026-10-26T20:38:45.496Z** the owner replied **“2”**, selecting the offered
option permitting owner-authorized agent execution of exact reviewed company-dev
handoff operations under the existing authenticated human operator account,
**without giving deployment workflows role-management privileges**. The offered
instruction was to change human-only policy for reviewed handoff commands and
synthetic verification, preserving least privilege, budget checks, access proof
and deployment safeguards. Issue #159 is contextual; this session decision is
not itself machine-authenticated approval proof for a future operation.

This supersedes historical human-only **execution/observation** requirements in
Stage 2 and R3, not owner authorization or any substantive security gate.
After merge and verified runtime conditions, only explicitly authorized exact
reviewed local argv may remove identified bootstrap workflow writer assignments
(preserving preview/audit/human Owner/read context), create the four deterministic
scoped workload grants, configure the separately approved existing Defender
100 GB/index settings after budget/offer proof, or perform bounded harmless
synthetic verification. No broader grant, continuation writer, new identity,
permission scope, workflow grant automation, deployment, merge or external
setting change is authorized by this PR.

The read-only `human-grant-plan` name is retained for compatibility; it rejects
Actions and SP contexts. Agent execution is local under the actual existing
human user's authority, not impersonated human observation. Preserve actual
reviewed IDs/argv/readbacks/UTC and distinguish human authorizer from executor,
observer and operator principal. Functional record **2** does this explicitly;
absent/version **1** remains human evidence, unknown versions/kinds fail closed.
References/hashes are context and byte binding, not authenticated consent or
proof of observation. Native owner review must verify actual evidence. See the
[current runbook and evidence fields](../../infra/README.md#owner-directed-local-agent-handoff--approved-2026-10-26-code-only).

The local agent may create only an explicitly authorized 1–65536-byte harmless
`synthetic-<UUID>.txt` in the exact application container, using Entra login.
Read only its own result tags/version/ETag and required metadata; never tenant
content/listings, manufactured tags, EICAR, endpoint exclusions, keys/SAS or
implicit operator data grants. Missing existing data authority stops. Cleanup
requires explicit exact-object authorization; no arbitrary deletion/lifecycle
change. Preserve real Microsoft result/time and created version/hash/size
correlation, 24-hour freshness and current readable security snapshot binding.
Mutable tags/test success do not establish hidden scanner topology, revocation,
PIM or approval. Workflows/audit SP remain management-read-only for handoff
and must never acquire data access or perform tests.

Actual equivalent/inherited/group/PIM revocation, eligibility/access, finance
and narrow ACA permission proof remain mandatory. PIM licensing/Graph
`403 ScopeNotGranted` is UNKNOWN, not absence; no new Graph scope/license/role.
For the fixed retired identity only, the
[bounded current-authority decision](#bounded-current-authority-evidence-decision--2026-10-26)
supersedes the full-schedule-proof obligation in this historical decision;
individual unreadable schedules remain UNKNOWN, not verified absent.
$118.13/month catalog estimate before tax/extras versus $120 ceiling is not
live credit/offer coverage or a billing cap; 100 GB is not a dollar cap.
No actual observation or live handoff completion is claimed. Receipt is not
continuation authority. Strict NoChange/three Modify/five Delete, original failed
checkpoint, no bootstrap retry, source closure 5/inspection 6, source/CI/native
and destructive guards are unchanged. No historical pins/archive bytes change.
Rollback is an authorized code revert and exact new-object/tuple rollback only,
never automatic writer regrant, resource overwrite or deletion. Existing
telemetry, backups, restore tests, SLO/error budgets, runbooks and cost checks
remain; no new paid service, library or deployable is introduced.

### Stage 2 - human permissions and separate Defender verification

The historical heading/anchor is retained. Human-only wording below is
superseded only by the dated decision
above; the exact grant tuples, actual permission proof and separate approval
requirements are unchanged.

The operator reads actual tenant, resource ID, `principalId` AND `clientId` for
each UAMI from completed ARM deployment operations and live inventory; names or
client GUIDs alone are insufficient. Verify expected scopes and direct/inherited
effective rights; missing visibility or permission proof stops continuation.
Grant API/web/migration `AcrPull` (`7f951dda-4ed3-4680-a7ca-43fe172d538d`)
at exact ACR scope `acrkeyfortacdevmxv24i2qhtib6` in the fixed destination RG.
Grant API `Storage Blob Data Contributor`
(`ba92f5b4-2d11-453d-a403-e96b0029c9fe`) only at
`stakeyfortacdevmxv24i2qh/blobServices/default/containers/tenant-applications`.
Use validated `ServicePrincipal` principals and existing deterministic assignment
IDs: `guid(scopeResourceId, uamiResourceId, roleDefinitionId)` (full role resource
ID). Verify exact existing matches idempotently; conflicts stop.
Separately, the human Defender operator needs reviewed subscription
`Microsoft.Security/datascanners/read` and `/write`, Event Grid and role-management
capabilities. Retain enabled on-upload scanning, full 100 GB cap, existing
sensitive-discovery/index settings and protection/retention settings.
Read current settings and actual scanner identity, service-created Storage Blob
Data Owner beyond the four grants, and exact reviewed readable service inventory.
Verify any reviewed Event Grid system topic's readable source/provisioning state,
without inferring hidden linkage. Use the specifically approved owner-confirmed
functional check below for the unobservable internal mapping/completion semantic.
Missing readable visibility, failed/stale correlation, unexplained access or
security drift blocks progress; never claim "only four total assignments".

### Stage 3 - protected verified continuation

Only after human/security verification, create existing-design Network/NSG,
delegated subnets, private DNS/link, 30-day logs, private PG16 B1ms/32 GiB
Premium_LRS/seven-day backup/Entra-only/no password/no public access, and external
ACA Consumption-only environment. Preserve approved network controls/extensions.
Bootstrap resources are existing references, not redeployed; CI does not
reconcile human roles or Defender. Minimum custom-VNet ACA caller permissions
remain UNPROVEN: resolve concrete narrow operations (including subnet/link and
existing logs-key dependency, without retaining keys), or stop. Do not widen
scope, substitute human full deployment or add paid components automatically.

### Stage evidence, re-entry and gates

Version 2 artifact: stage `bootstrap`/`continuation`, mode `initial`/`reviewed-reentry`;
existing six JSON files plus exact `inventory.json`, bound to SHA/run/attempt/artifact,
complete source manifest hash, parameters/template/what-if hashes and native gate context.
Bind starting/expected inventory, actual IDs/roles/backend, predecessor execution,
human security evidence and permission handoff/change-freeze references.
Reject historical six-file full plans. Initial bootstrap requires an empty RG;
continuation must exactly match reviewed bootstrap plus security inventory.
Partial re-entry requires frozen actual ARM operations/inventory and a freshly
reviewed preview; unknown/timed-out outcomes are not automatic retries.
Deletion, extras, drift or recreated principals stop; no blanket populated-RG or
Modify allowance, automatic cleanup or replay. Exact completed state is a
verified no-op, not resubmitted. Mismatch means no ARM PUT.
Retain protected environments without independent-review or actor-separation
requirements, operator live UI bypass-off verification, exact-SHA checks and latest
CI/security/DAST success. Changed stage/evidence/permissions/attempt needs review.
No AI substitutes for human approval; no customer/app activation before security
verification and a future separately authorized synthetic scan-result proof.

### Approved bounded verification-only source transition — 2026-10-26 UTC

The owner explicitly approved: **“Prepare and publish the regression-tested,
verification-only recovery PR; no merge or execution”.** This approves the
code/test/documentation contract below, not runtime authorization or full ADR
acceptance. Publication is delegated to the parent operator; this implementation
does not commit, publish, merge, dispatch, preview against Azure or reconcile
resources/permissions/settings.

PR #164 corrects bootstrap verification of ARM output Reads without changing
Bicep. The persisted read-only reconciliation reached **“Completed stage
sourceSha256 drift”**: the original incomplete checkpoint manifest is
`48349caeb8e502c75796bc4cddde68d68eb4ca9691b426880b325289c2e18703`,
while merged-main `5437798d1e892abe145463a40a5d3122f5cbeda8` binds
`b94093439158494a8aa36e6c46d0f5a71980d21e89f1a3472edf6de6512393cd`.
No recovery run/artifact was created. That main SHA is historical context, **not
the future PR's immutable target SHA**.

**Decision:** add only an explicit `stage_context.sourceTransition` of kind
`bootstrap-verification-only`, version 1, to existing bootstrap
`reviewed-reentry`. Without it, the identical-source recovery checks remain
unchanged. Bind `from` and `to` immutable revisions and full nine-path manifests/
digests to actual Git blobs. Require ancestry and reject repository changes
outside the three existing verification helpers and the specifically enumerated
company regression tests/ADR/runbook. These three helpers are necessary because
preview, apply/artifact/checkpoint generation and their shared decision engine
must enforce the same route. Bicep, workflows, parser, public contracts,
authorization packages and other executable/configuration surfaces cannot change.
The owner review URL is context, **not machine approval or semantic proof of
arbitrary code changes**; human review of the helper diff remains necessary.
Existing shallow workflow checkouts may hydrate history by read-only fetch from
the fixed repository, using the existing job read credential ephemerally; HEAD,
workflows, identity/federation and credential configuration do not change.

Require the exact nonexpired original failed initial-bootstrap run/attempt and
immutable apply archive ID/digest; hash and extract the **same ZIP**, bind raw
incomplete checkpoint bytes, original submitted body, compiled template,
parameters, preview/source and retained Succeeded result. The original actual
deployment name/SHA must remain the origin's, never a renamed current-SHA target.
No chained transition, security handoff, initial mode, partial recovery or
approved Modify delta is supported. Exact seven typed resources, full projected
properties and all original tenant/principal/client bindings must equal the
original checkpoint, not just the reviewed current baseline. Re-run the strict
recursive bootstrap verifier: resource Creates alone establish provenance;
context-bound Reads do not. Require root and both nested deployments Succeeded
with frozen full responses, timestamps/correlation IDs and operation timestamps
inside the authenticated original run's time bounds. Another deployment history
entry, existing new-SHA target, incomplete visibility, recreation or drift stops.
Retain pre-handoff role/Defender checks even though this route cannot submit:
new human grants or enabled scanning cannot silently become a security handoff.

Before provider what-if, both routes must pass these origin/state checks.
Fresh preview and apply what-if must contain **only NoChange**, including nested
deployment records, without diagnostics, potential changes or property deltas;
post-preview checks must reproduce identical actual state. This route can
return only **VerifiedNoOp**, never submit. Only the normal successful no-op
generator emits a new checkpoint/bootstrap-state/result. It records old/new
source bindings, full original incomplete checkpoint and immutable artifact
reference, original actual deployment identity and success provenance; it never
rewrites the original failed artifact or launders it into historical completion.

**Remaining gaps:** no runtime recovery/preview/PUT has been authorized or
executed by this change. The persisted preview API reports bypass=true and
apply=false; neither a settings change nor a fresh human UI observation is
claimed. Preserve freeze and existing resources/authentication configuration.
Writer removal/no-equivalent-authority proof, grants/security/functional
handoffs, telemetry, backups/restore tests, SLOs/error budgets and operational
acceptance remain separate. No services or costs added: $108.35/month estimate,
$120/month before-tax ceiling remain planning figures. Rollback is withholding
dispatch and a separately reviewed code revert; never deletion, initial retry
or reuse of an old preview. See the [bounded recovery runbook](../../infra/README.md#verification-only-source-transition-code-approved-not-execution-authority).

### Approved separate bootstrap completion evidence contract — 2026-10-26

The owner approved implementation/publication through the parent operator of a
bounded GET-only completion audit, then explicitly clarified: **reject wildcard
read grants; require explicit permitted read actions**. This is code-contract
approval, not full ADR acceptance, merge, dispatch, Azure execution, role changes
or security/continuation authorization. Existing preview role sufficiency is
unproven; no permissions are changed by this implementation.

**Business invariant:** historical ARM success can be recorded together with
current frozen identity/property/provenance observations without falsifying the
failed workflow/incomplete checkpoint, claiming NoChange or granting deployment,
security or data authority. The old verification-only v1 gates stay strict.

The new manual `company-development-bootstrap-completion.yml` uses separately
configured audit federation (see the correction decision below), protected
`company-dev`, owner context and shared foundation
concurrency. Its command imports only transport-free completion validation,
never the apply/state drivers or a submit-capable transitive module. Shared
inventory, secret checking and full resource projection preserve old behavior.
Transport enumerates exact management GET endpoints/API versions/host/scope,
including same-endpoint bounded pagination; all unknown/missing/error/foreign
visibility fails closed. Effective permission evidence rejects all wildcard,
data, unknown and non-read authority, even if exclusions purport to subtract it.
No what-if/validate, PUT, grant, Blob read, key/token export or arbitrary CLI
passthrough is available.

Before OIDC and before receipt, bind actual environment identity/branch/rules,
protected exact merged SHA, latest exact-SHA green push CI/Security/DAST and fresh
audit-only owner intent/UI no-bypass reconciliation. Actor/reference/hash fields
are context, not machine-authenticated approval. The single-owner policy remains;
no independent review or prevent-self-review rule is reintroduced.

Authenticate the original failed attempt/artifact and same bounded ZIP against
its immutable archive/checkpoint/template/parameters/submission bindings. Verify
all seven typed resources and full original projection, tenant/distinct UAMI
principal/client bindings, complete inventory/history, all 17 context-bound
Succeeded operations and full root/two nested deployment responses, correlation
and timestamps inside original authenticated run bounds. Resource Creates alone
establish creation. Unknown pre-handoff grants, enabled scanning or real
property/principal drift stop; only the exact historical grants below are audit evidence.
Two complete reads must equal the fresh owner-reviewed frozen snapshot; repeat
original archive and protected/source/quality checks. Retain the observing
audit caller separately from preview and historical apply client/principal and explicitly
make **no revocation claim**.

#### Approved bounded audit correction — 2026-10-26 13:55:09.016Z

The owner's **“do it”** explicitly approves implementation/publication of this
narrow correction and a separately reviewed access-change **PLAN ONLY**.
Diagnosis: [issue 159](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6417627535).
This does not accept the entire ADR, establish functional deployment readiness,
authorize merge/dispatch/apply/continuation, or authorize any identity, role,
federation or GitHub setting mutation.

**Comparison decision:** only for the seven exact typed bootstrap resources,
compare null with absence at the 31 diagnosed optional SDK paths: ACR identity,
kind and SKU capacity/family/model/size (6); three UAMIs identity/kind/sku (9);
Storage identity and those four SKU members (5); Blob service identity/kind/
location and those four SKU members (7); container identity/kind/location/sku (4).
The compatibility projection is comparison-only, symmetric, and never collapses
an omitted/null SKU into a SKU object. Concrete values, other paths, properties,
security, principals, source and provenance remain strict. Original archive,
checkpoint, raw observations/journal and their hashes are not normalized.
Strict NoChange/reapply and unresolved **3 Modify / 5 Delete** remain unchanged.

**Identity/grant decision:** preserve the legitimate preview WhatIf identity and
its current grants. Require a separate, human-configured audit app/SP, exact
protected configuration, exact custom read-role contents and fresh effective
permissions; no fallback to preview, writer, human or an arbitrary caller.
Role-definition GETs now join the closed transport. Recognize only the complete
reviewed historical assignment/role-definition hashes for the direct RG preview
WhatIf and bootstrap writer grants plus their inherited Context grants. Exact
existing inherited human assignment hashes are state evidence only; human Owner
rights are never attributed to the preview/audit SP. Reject additional,
rebound or expanded grants and missing visibility. The bootstrap writer is
**NOT REVOKED**; `revocationVerified=false` and `securityHandoffVerified=false`.
Continuation remains blocked pending separate revocation/equivalent-access
checks and security handoff. Do not remove historical grants blindly.

After correction merge and separately approved access-plan application, obtain
a **fresh actual-audit-observer** complete snapshot, human approval of its exact
digest and an actual UI observation timestamp before any separately authorized
audit. Generic confirmation and this implementation approval are not digest
approval. The [access plan](../../infra/README.md#separate-read-only-audit-access-change-plan-not-applied)
records exact actions/scopes, federation, ownership, evidence and rollback.
The exact access plan was subsequently approved and applied as recorded below;
do not recreate it. Code rollback is a reviewed revert; access
rollback removes only the newly approved audit access, never preview/historical
grants. Costs ($108.35 estimate/$120 ceiling), telemetry, backups/restore tests,
SLOs/error budgets and outstanding operational readiness are unchanged.

#### Approved separate inspection-only route — 2026-10-26 15:21:06.973Z

The owner approved **“Prepare a tested PR for this inspection-only workflow,
using the existing audit identity and permissions. Do not weaken the audit or
deployment gates.”** This approves implementation/tests/docs/PR publication,
not merge or live workflow dispatch. Scope is the company bootstrap foundation,
not the unapproved application stack.

The [exact access plan is APPLIED](../../infra/README.md#separate-read-only-audit-access--applied-observer-effectiveness-unmeasured)
under [specific owner authorization](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6419531083);
[status/readback](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6419710770)
records existing secretless audit client `142bbb0f-118a-4dea-9f53-69e03d3f308b` /
SP `c0f5fe98-9cb7-4a6b-a371-fbe549c6dfc1`, two exact roles/assignments, singleton
immutable-subject federation and protected environment variables. Preserve their
bytes, preview/historical access and OIDC customization. No new RBAC/identity/
federation/config/resources/Graph scopes/licenses are authorized here.
Actual observer token/effective permissions remain unmeasured; human `*` pages
are not observer evidence. License-blocked Azure PIM and scope-blocked directory
PIM remain **unknown**, never success or authority to expand access.

**Cycle-breaking decision:** a separate manual
`company-development-inspection.yml` uses protected `company-dev`, main-only
owner `cmbuyamba`, shared `company-dev-foundation` concurrency and existing
contents/actions read plus id-token write. Dedicated commands in the existing
read-only module reuse the closed `observe`/`assertObserverBinding` transport;
no apply/write-capable imports, WhatIf/validate/data/key/token export or receipt
production are reachable on this route. It authenticates the exact byte-pinned
existing observer **without requiring snapshot approval first**.

Before OIDC and finally, require the exact merged SHA/committed closure, current
protected main/required native checks, latest exact-SHA green push CI/Security/
DAST, actual environment identity/protection/bypass=false, exact native
workflow/run/job/attempt/repository/owner and matching protected observer binding.
Fresh inspection-only owner context must predate dispatch, remain under one hour
old and identify exact-source review references. This is API/runtime context,
**not manual UI observation, freeze or digest approval**. Inspector schema rejects
those audit-only fields; it never invents `observedAt`. The complete runbook
defines future inputs/commands only once the actual merged SHA is known.

Two complete identical actual-observer GET snapshots retain full raw resources,
inventory/history/operations/roles/permissions/Defender and journal, plus unchanged
original archive/incomplete checkpoint and provenance. Failed GETs, missing or
malformed visibility, foreign endpoints/pagination/scope/type, unauthorized
permissions/grants, drift and secret payloads fail nonzero without artifact or
authority. The historical-state semantic validator may report bounded
`accepted|rejected` diagnostics after complete collection; neither is an approved
audit. Scoped read sufficiency is checked at the actual scope (twelve RG reads);
existing audit permission gates retain their original default behavior.

Evidence has a distinct version-1 `bootstrap-inspection-evidence` /
`inspection-only` kind, `company-dev-inspection-v1-SHA-RUN-ATTEMPT` artifact/path
and complete file hashes; snapshot digest is production `stateHash`. Every
completion/predecessor/continuation consumer rejects it. Raw evidence stays in
restricted repository-controlled Actions artifacts for seven days, not PR logs
or Git. It explicitly withholds audit completion, complete permissions/PIM proof,
writer revocation, continuation and security-handoff authority. No original
checkpoint repair, receipt or approved-audit claim is possible.

Inspection uses mode-specific version **4** thirteen-path runtime source closure,
including the exact new workflow, and the whole repository diff review. Audit v3
twelve-path and historical v1 nine-path manifests/workflow blob pins remain
compatible and strict. No prefix allowlist, hidden helper, fabricated future
source digest or prepublication circular SHA binding is introduced.

Next steps remain private human review/approval of the actual snapshot digest,
fresh genuine UI `observedAt`, exact-source audit-only execution consent and all
existing audit checks. Inspection does not waive freeze, security/writer-removal,
handoff, strict NoChange/3 Modify/5 Delete, telemetry, backups/restore tests,
SLOs/error budgets or readiness. No new paid service; $108.35 estimate/$120
pre-tax ceiling unchanged. Rollback is reviewed code revert/withheld dispatch,
preserving originals and existing access, never automatic Azure mutation.

A normal successful workflow alone produces a version-1
`bootstrap-completion-receipt` / `audit-readonly` artifact with unchanged historical
ZIP/raw incomplete checkpoint, full typed state/operations/provenance, two-pass
GET journal and source/environment/quality/owner references. Inventory and file
digests are closed; unsafe names/duplicates/symlinks/oversize/encrypted archives,
digest drift, missing pages, resolved secrets or failed audits produce no success
receipt. Existing seven-day Actions retention/quota applies; this is not a new
backup or archive service.

New plan/checkpoint source manifests explicitly use version 3 and all twelve
paths, including both consumers, new command/helper and entire new workflow.
Historical nine-path manifests retain their original format and semantics.
`assertVerificationSources` remains unchanged: workflow changes and the new
dependency closure cannot be silently squeezed into v1. Pin exact original and
PR166 workflow blob pairs, verify ancestry and repository-wide diff review,
then bind the complete implementation source/workflow at its eventual reviewed
SHA. No broad workflow path whitelist, hash-ignore field or fabricated final
SHA is introduced. Historical CLI regressions use exact baseline driver bytes
to retain v1 behavior; v3 tests cover the new complete closure.

The receipt says historical ARM Succeeded/current state verified, original
workflow failure/checkpoint false, what-if not evaluated, property deltas
**UNRESOLVED**, and no reapply/continuation/security-handoff/data-admission
authorization. The genuine three Modify/five Delete prediction remains blocked,
not relabeled noise. No `VerifiedNoOp`, v2 completed checkpoint or original-run
repair is emitted.

Consumers authenticate the new workflow attempt, immutable unexpired unique
artifact/archive/file/source digests and original failed provenance, then replay
the complete two-pass read journal. Only an explicitly typed process-local
completion basis can enter initial continuation or manual grant preparation.
Both actual preview/apply loaders are wired; legacy plan/checkpoint consumers and
bootstrap recovery reject receipts. No checkpoint laundering occurs. Continuation
still independently requires original-writer revocation (including equivalent,
inherited and PIM authority), actual current grants/Defender/functional evidence,
new exact-SHA preview/plan and explicit deployment authorization. After handoff,
compare original immutable identities plus independently approved current security
state, not stale pre-handoff properties. Receipt alone authorizes none of these.

For this fixed retired writer, read that schedule-proof prerequisite subject to
the [bounded current-authority decision](#bounded-current-authority-evidence-decision--2026-10-26);
the receipt still supplies no current-authority or operational-review evidence.

The [completion audit runbook](../../infra/README.md#historical-bootstrap-completion-audit-code-approval-not-execution)
defines exact inputs, source-diff/hash construction, artifact/ref inventory,
failure stops, manual authorization limits and rollback. Offline tests use only
deterministically generated synthetic ZIP, seven-resource/17-operation GET
observations and workflow/artifact metadata. A test-only loader substitutes
synthetic provenance bindings without changing runtime authentication checks;
unmodified runtime bindings reject the synthetic archive. Operational originals
remain outside the repository in session evidence, never publication fixtures.

Operational, telemetry, backups/restore tests/measured RPO/RTO, SLO/error-budget,
security topology, readiness, eligibility/capacity and cost gaps remain open.
No service/paid component, grant, Defender/upload, foundation-ready or cost
authority is added. Existing $108.35/month estimate/$120 before-tax ceiling are
planning values, not measured spend or a billing cap. Rollback is withholding
dispatch/receipt/consumption, preserving originals and explicitly superseding
bad receipts; code reverts are separately reviewed. Never delete/recreate or
reapply the original template as rollback.

### Acceptance map and current implementation boundary

Both protected routes now implement the staged contract, with a reachable local
synthetic bootstrap-checkpoint → owner handoff → protected continuation → fresh
reviewed no-PUT replay. This is **local implementation, not Azure readiness or
ADR acceptance**. Full effective/transitive/PIM authority and owner observations
are checked by the already-approved native-human procedure; JSON is not approval.
The [bounded current-authority decision](#bounded-current-authority-evidence-decision--2026-10-26)
qualifies only full schedule proof for its fixed scope, including R3 below;
it does not change the executable acceptance map or attest an observation.
The small shared `company-development-state.mjs` is essential to use the same
read-only state/security/re-entry rules in both existing CLI routes, rather than
duplicate them. It is not another deployable, Bicep surface, service or tool.

PR #161 hardens that contract without changing its authorization: same-stage
recovery/replay binds the original apply client before execution/checkpoint
creation and preserves it in later checkpoints. Protected scopes use closed
read/deployment-operation allowlists with per-grant effective exclusions, not a
finite mutation blacklist. A distinct already-succeeded target needs its own
verified completion checkpoint. A completed same-stage predecessor can only
verify no-op or stop; a missing PG server/children never permits write recovery.
Successful targetless ARM output evaluation is not resource-creation evidence.
The pinned Checkov adapter exposes conditional resource bodies to existing
checks without evaluating away a branch, changing Bicep payloads, or adding
skips. Parser errors/unknown conditional shapes remain blocking.

| Requirement | Executable behavior / acceptance evidence | Remaining work / execution blockers |
| --- | --- | --- |
| R1 stage-selective templates | Three existing Bicep surfaces; seven bootstrap writes; nine continuation writes and existing bootstrap references. Actual compiled inventory/security tests protect PG16/B1ms/32 GiB Premium_LRS/seven-day/Entra-only, ACA Consumption and source/default payload digest, including full Defender 100 GB/index settings. Company stages never grant or write Defender/scanner. | No live capacity, eligibility or minimum ACA permission sufficiency claim. |
| R2 versioned evidence | Seven-file v2 plan, stage/mode/SHA/run/attempt/native context, exact baseline/expected inventory, complete nine-path dependency manifest and raw hashes. Continuation/re-entry bind predecessor checkpoint hash AND actual GitHub apply workflow/repository/main/manual run/attempt/artifact ID/name/expiry; checkpoint binds source/template/parameters and actual resources/original apply caller. Legacy/historical full plans fail. | Artifact IDs come from real metadata, not invented pre-upload IDs. Human references/hashes are review context, not issuer attestations or authenticated owner approval. |
| R3 actual state / human handoff | Typed resources/ARM operations reconstruct actual UAMI tenant/resource/principal/client IDs; manual-only deterministic four-grant preparation/idempotency never executes grants. Current direct/inherited grants, scanner identity/Data Owner, full on-upload/100 GB/index/no-exclusion settings and reviewed service inventory are read. Caller-context permission reads reject surviving bootstrap/security/data authority and bind original bootstrap apply SP. Owner functional record and all references are protected-context/hash-bound. | Machine scope is readable identities/settings/grants/current-caller permissions only. Owner/native review must establish equivalent/transitive/PIM rights removal, genuine observation and separate test authority. Hidden internal topology remains UNVERIFIED, not proved from names/tags/absence of errors. |
| R4 safe submission/re-entry | Initial bootstrap requires empty resources/history. Actual frozen baseline and terminal ARM operations, exact staged inventory, explicit canonical property-level Modify approvals and fresh matching what-if are required for recovery. Failed/canceled/unknown/running/timeouts stop without auto-retry/delete. Completed exact source/template/parameters/current resources plus fresh NoChange is no-PUT, including inspection after an unknown submission outcome. | Newly observed partial-bootstrap identities lack historical checkpoint continuity; owner must inspect creation/activity/operations under freeze. Recorded identities cannot be swapped/recreated. This is a human limitation, not fabricated machine continuity proof. |
| R5 native workflows | Two existing main/manual-only workflows, same concurrency, distinct federated identities, stage/mode/version/context inputs and explicit artifacts/checkpoint. No mandatory independent reviewer, prevent-self-review or human actor separation. Exact SHA/run/attempt/environment ID/snapshot, protected branches, explicit human authorization and operator live UI bypass-off review retained. RG caller permission reads check only documented template PUT types/deployment what-if/workspace-key action against stage allowlists. | Native controls and actual authority remain external. Known-operation checks explicitly return ACA minimum permission proof EXTERNAL_REQUIRED; they do not establish the complete custom-VNet backend permission contract. No broader grants or activation-variable changes. |
| R6 local tests | Existing company tests cover positive functional handoff and both protected CLIs through continuation/no-op, exact recovery deltas, timeout/unknown inspection, foreign destination/tenant/principal/roles, missing/stale/failed security, non-revocation, insufficient/broad caller rights, stage/version/hash/dependency/provenance drift and no PUT on failures. Compiled security/default compatibility and pinned parser coverage retained. | Local/synthetic only; no live upload, permissions, activation or Azure validation. Exact BEFORE/RED/AFTER/GREEN and full-verification results are retained in session evidence. |

#### Backend-evidence semantic: historical question and specific owner resolution

The official [Defender settings read schema, 2025-06-01](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/security/resource-manager/Microsoft.Security/Security/stable/2025-06-01/defenderForStorageSettings.json)
exposes enabled/cap/index settings and `operationStatus` for failure/partial
success, **not** a successful provisioning-state field or storage-to-scanner
linkage. The optional `scanResultsEventGridTopicResourceId` is a results
destination, not evidence identifying the service-managed backend.
The official [data scanner read schema, 2026-08-01](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/security/resource-manager/Microsoft.Security/Security/stable/2026-08-01/datascanners.json)
exposes an identity-only resource; its properties do not identify Storage,
backend Event Grid or provisioning state. These are documented read schemas,
not proof of provider availability in this destination. No Azure reads/writes
were performed to establish live behavior, and Bicep API versions are unchanged.

The implementation originally stopped and asked for the authoritative observable
instead of inventing fields/linkage. The specific owner decision linked above
resolves **only** that missing semantic: readable settings/identities/permissions
plus an owner-confirmed harmless functional test, not complete internal mapping.
The current local contract binds exact subscription/RG/Storage/container via IDs
and the readable snapshot hash; a UUID-named `synthetic-<UUID>.txt`, version or
ETag, content SHA256 and 1–65536-byte length; `cmbuyamba` observation and separate
execution-authorization references; strict UTC enablement ≤ test start ≤ upload
≤ scan ≤ owner observation ≤ now, within 24 hours of test start/observation;
result exactly `No threats found`. Missing/failed/stale/mismatched records stop.
The 24-hour/64-KiB bounds are conservative local evidence limits, not Azure SLAs.

Microsoft's [manual test procedure](https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-storage-test)
describes observing “Malware scanning scan result” and “Malware scanning scan
time”. [Blob index tags are mutable and not tamper-resistant](https://learn.microsoft.com/en-us/azure/defender-for-cloud/introduction-malware-scanning#blob-index-tags).
They MUST NOT be the sole security control or an automated security-sensitive
data-admission signal; owner-confirmation/native review plus readable configuration
and actual grants are required here. The workflow does not read/upload/delete/
modify blobs or tags. No new topic/diagnostic service, EICAR, endpoint exclusion,
app/customer-data/migration/cutover capability or live test authority is added.
Optional results topics and absence of errors never prove internal linkage.

All relevant Bicep and the pinned parser gate remain required, without gate/
exclusion changes. No source/default resource behavior changes. Withhold activation
until actual external controls, offer/capacity and minimum ACA permissions are
proven; preserve unused resources/evidence after partial execution, never delete
or retry automatically.

## Historical one-shot design and invariant (superseded execution shape)

The one-shot narrative below preserves the earlier design record. It must not
be used as the staged runbook, permission allowlist or current artifact schema.
In particular, company workflows no longer emit its four role grants/Defender;
those remain unchanged only for source/default shared-module callers.

The source foundation unconditionally enables PostgreSQL public networking and
the `AllowAzureServices` special `0.0.0.0` firewall rule. That admits attempts from
other Azure customers, not just this company. Do not extend that assumption to
the destination or weaken password-disabled Entra authentication.

Preserve organization authorization/RLS, exact money, immutable audit/evidence
history and human decision boundaries. This empty foundation exercises none of
those application paths and contains no customer data. Source dev remains the
sole serving system and the recovery boundary. ADR-008's Azure-first and
ADR-001's modular-monolith boundaries remain unchanged; no deployable service is
added. Production requirements in ADR-009 remain unresolved.

## Historical proposed one-shot implementation

- Fixed destination subscription `891e5e6e-8ae3-4455-9184-8d7606223d91`,
  tenant `8019a048-e7d6-48e8-984a-b902f641a21b`, required empty target RG
  `rg-keyforta-companydev-san`, region `southafricanorth`, naming `keyforta-cdev-*`.
  The dedicated entry module explicitly scopes its only module to that RG/sub.
  The preview script also checks actual Azure tenant/subscription/RG/region.
- One VNet with explicit, canonical RFC1918 inputs, separate ACA `/26` and
  PostgreSQL `/28`, containment/nonoverlap and published ACA reserved-range
  validation. No defaults or owner-approved example values are committed.
  Corporate/future-peering overlap is a human approval, not provable by a local
  CIDR parser. All inputs must match externally maintained approved values.
- ACA subnet delegates to `Microsoft.App/environments`. PostgreSQL subnet
  delegates to `Microsoft.DBforPostgreSQL/flexibleServers`. A PostgreSQL NSG
  permits TCP 5432 from ACA and its own subnet, then denies other SQL clients.
  No custom ACA NSG, forced egress, route appliance or NAT gateway is added.
  Default platform DNS/Entra/Storage egress is retained; this is **not** internet
  egress filtering or full-VNet isolation.
- PostgreSQL 16/B1ms/32 GiB Premium_LRS, company Entra-only auth, password disabled,
  no HA, seven-day backup. VNet injection, **public access disabled**, zero
  PostgreSQL firewall resources. Preserve the delegated subnet's Storage
  service endpoint/WAL path. No PostgreSQL private endpoint.
- One private DNS zone `companydev.postgres.database.azure.com`, one VNet link
  with autoregistration disabled, Azure-provided DNS. No public/customer DNS,
  forwarding resolver, domain, certificate or customer-identity change.
- External ACA **workload-profiles** environment with exactly the `Consumption`
  profile, no Dedicated profiles, apps or jobs. The platform creates
  `ME_keyforta_cdev_<suffix>` in this subscription; approve its generated
  infrastructure separately in final inventory review. Do not edit it.
- Reuse the existing foundation module with optional private-network settings;
  its empty-object default preserves source public networking, firewall and
  original Consumption intent. Source wrapper and all source workflows/variables
  are unchanged. Source behavior is intentionally not “fixed” by this isolated
  preparation. Protect it with regression tests and explicit human authorization.
- ACR Basic and Blob keep authenticated public endpoints. Preserve registry admin
  disabled, disabled shared keys, OAuth, private container, TLS 1.2+, Defender,
  **enabled** on-upload malware scanning with the full 100 GB setting, 30-day
  logs and seven-day Blob soft delete. No security downgrade to fit budget.
- Existing three managed identities and four scoped resource-role declarations
  are retained as proposed resources. No deployer, federation, DB administrator,
  SQL grant or billing resource is created by this change.

## Options and cost consequences

### Approved offer/destination change — 2026-10-25 UTC

The user replaced the previous destination
`212bf9c5-2326-4852-846e-7227bac81fd5` (**superseded**, no fallback) with the
fixed subscription above. Selected read-only ARM metadata verifies **Enabled**,
the exact company tenant, `quotaId: FreeTrial_2014-09-01` and spending limit
**On**. Parent read-only evidence reported zero resources; this is not proof of
SKU availability or a successful provider preview. The **$200 free credit is
user-reported**, with remaining balance/expiry **unverified**, not a recurring
monthly allowance. Do not apply old Pay-As-You-Go billing evidence to this offer.
No upgrade, spending-limit removal, service addition or security downgrade is
authorized. The architecture, $120/month before-tax ceiling and $108.35 estimate
below are unchanged; credit coverage is not established.

Microsoft's [spending-limit guidance](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/spending-limit)
explains that exhaustion can disable services and that some separately billed
services are not bounded by this limit. Trial expiry/disablement is an
operational interruption risk, not a recovery strategy or a $120 cap.
[PostgreSQL capacity guidance](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-resolve-capacity-errors)
and [ACA quota guidance](https://learn.microsoft.com/en-us/azure/container-apps/quotas)
require subscription/region/SKU checks: an Enabled subscription and a published
regional service listing do not guarantee B1ms PostgreSQL or ACA capacity in
South Africa North for this trial. Eligibility/quota/capacity, credit validity
and actual pricing remain pre-execution blockers; do not upgrade to resolve them.
Preserve seven-day backups, restore-test requirements, telemetry, SLO/error-budget
and runbook gates below. Credit expiry must not strand the only recovery copy;
the source remains untouched and no data is moved by this foundation change.

All former-destination previews and source hashes are stale for this retarget.
Require fresh exact-SHA CI, protected preview, hashes and human apply
authorization. No-admin-bypass verification remains; independent/no-self-review
requirements are superseded above. No OIDC, RBAC, GitHub environment setup, dispatch or provisioning occurs
in this change. PR #157 publication consent is not consent to publish a new PR.

Public-retail USD, 730 hours, before tax, observed 2026-10-25; account discounts
and free consumption grants are not credited. These are estimates, not caps:

| Line | USD/month |
| --- | ---: |
| Original full foundation/usage envelope | 81.90 |
| One Standard regional LB, first five rules at $0.025/hour | 18.25 |
| Managed ingress + egress Standard IPv4, each $0.005/hour | 7.30 |
| One private DNS zone | 0.50 |
| One million private DNS queries allowance | 0.40 |
| **Proposed envelope** | **108.35** |
| **Approved preparation ceiling before tax** | **120.00** |
| **Headroom** | **11.65** |

VNet/subnet/NSG base has no separate hourly fee, but **ACA managed networking is
not free**. LB processing $0.005/GB shares the original $5 networking contingency.
The original estimate still includes logs 5 GB/$16.80, scanning full 100 GB/$15,
Blob $1.11, excess backup $3.62 and separate restore/CI contingency $5.
Those contingencies are not validated workload/restore quotes.

Consumption-only compute does not activate a Dedicated workload-profile fee.
The $0.10/hour Dedicated management meter and premium features such as private
endpoints/planned maintenance are excluded. Do not confuse these with the
$0.146/hour Environment premium-feature meters. No “VNet is entirely free” claim.

Alternatives considered: (1) public networking plus all-Azure rule—rejected;
(2) parked database with public access disabled and no private path, $81.90,
but migrations/apps/restore clients cannot connect and future replacement is
likely; (3) internal ACA, at least $104.70 before additional future ingress/DNS
design, not selected because it changes the product's ingress architecture.
No complete functional app-stack budget or capacity guarantee follows from this
foundation estimate. Taxes, actual data/queries/management traffic, calendar hours,
future compute and restore duration can exceed the envelope. Budgets notify;
they do not enforce $120. Stop and seek approval if pricing/scope changes.

## Historical one-shot delivery; retained access and operational constraints

The preview route remains **preview only**. A separate plan-bound foundation apply
route is prepared; both are disabled until externally activated after review.
Neither can bootstrap providers/RG/identities/roles. The guard reads documented environment
fields before the OIDC-capable job: protected branches, actual environment IDs
and the actual rule inventory (empty is valid). Missing API access or metadata
fails closed. The required **no-admin-bypass** setting is not exposed by the
documented REST Environment or GraphQL Environment/DeploymentProtectionRule
schemas. Under the subsequent decision above, independent environment reviewers
and prevent-self-review are not required; a missing/invented bypass field still
proves nothing. YAML does not configure environment settings.

The pre-OIDC guard publishes review context: exact checkout SHA/run/attempt,
actual environment ID/node ID and normalized API-verifiable protection snapshot
hash. The authorized operator inspects the live environment, manually verifies
the bypass setting is disabled, checks required CI/security/audit at that SHA,
and retains the verification and exact SHA/run/attempt/environment ID/snapshot
hash alongside explicit human authorization. No independent actor, reviewer
sign-off or native approval comment is required. Reject missing evidence,
blocked checks, mismatches or changed settings. A new run attempt, revision or
environment change requires fresh context. An actor-supplied boolean is not
human authorization.

Only the job declaring `environment: company-dev` can reach Azure login, after
GitHub permits the environment job. It re-reads supported API fields and compares the
snapshot and exact run/revision before login. Context outputs and hashes do not
attest manual completion; code does not parse comments or claim automated proof
of the UI-only setting. Manual-checklist enforcement remains an explicit human
operator responsibility. No unconditional stop or speculative evidence service
remains, and no repository activation flag substitutes for human authorization.

After those external controls/approvals, the preview route could proceed.
CIDRs must exactly match approved environment values.
The exact full ARM parameter object must match the prepared file, then is
serialized in memory and passed inline, avoiding a file-read race. Evidence
includes the exact approved consumed parameters and their in-memory hash.
Destination-only OIDC could then read providers/RG and request a what-if.
All eight providers must already be Registered, and the target RG must already
exist and be empty, using separately authorized bootstrap. The script will not
register, create, assign, deploy, seed, push images or run SQL. What-if must be
create-only, target-scoped and restricted to the foundation resource types;
unknown/ignored/modified/deleted resources stop the route. Success stores
SHA/run/template/parameters/what-if digests, not deployment authority.

The separate main-only apply workflow uses native **`company-dev-apply`**
protection and a distinct scoped federated principal; no guard job receives OIDC.
The same operator manual no-bypass procedure applies without independent review.
Before login, the read-only guard publishes the exact SHA/run/environment
snapshot plus successful preview run/attempt/artifact ID and operator-
reviewed source/template/parameter/what-if hashes. The protected job revalidates
that binding, actual environment snapshot, external approved CIDRs and distinct
principal before login. No repository flag or homemade reviewer record replaces
explicit human deployment authorization.

Only the exact nonexpired, same-SHA successful preview artifact is accepted;
all six file shapes/contents, provenance and reviewed hashes are validated.
Current foundation source must match the reviewed source manifest. Source
manifests hash raw blobs from the exact workflow SHA and require each
targeted worktree file to match those bytes; missing/untracked-at-SHA/dirty
foundation files fail before OIDC. Unrelated worktree changes remain allowed.
Latest exact-SHA main-push CI/security/DAST runs must succeed, not stale successes.
After scoped login, registered providers/exact empty company RG are read-checked,
and fresh create-only provider what-if must exactly equal canonicalized reviewed
change payloads. Quality and emptiness are checked again before the single
fixed-company-RG incremental ARM PUT using validated **in-memory** template and
parameters. Shared preview/apply concurrency is not a lock on external Azure
writers: an external owner-controlled change freeze is required.

The apply principal requires externally reviewed effective resource permissions,
three resource-scoped `AcrPull` assignments and one document-container-scoped
`Storage Blob Data Contributor` assignment, constrained to the new identities.
ACA managed-RG/platform permissions must be explicitly resolved; generic Owner
or target-RG-only sufficiency is not assumed. The route performs none of this
permission/bootstrap setup. Missing least-privilege readiness blocks activation.
Detailed inputs/reviewer procedure are in `infra/README.md`.

No source, apps/jobs/SQL/data/customer identity/public DNS or cleanup capability
is added. Submission/body hash, fresh what-if and polled ARM result are retained.
Failure/timeout stops without automatic Azure retry/deletion/rollback; partial
resources block replay pending explicit inventory/recovery review. Foundation
ARM success is not connectivity/restore/application/cutover acceptance.

Future ACA migration/seed/restore jobs can share this VNet/DNS path but are **not
defined or activated here**. GitHub-hosted runners cannot directly resolve/reach
the private DB. OIDC is not a network tunnel. A later approved workflow may start
a reviewed digest-pinned ACA job through ARM and poll results; job-start permission
can override a job's template/use its identity and requires tight scope/review.
Do not add broad GitHub/Azure firewall rules. Company DB-admin bootstrap and
least-privilege grants remain separate authorization.

Before app activation: synthetic DNS/5432/TLS/Entra success tests, denied public
and unauthorized-client tests, RLS/isolation, ACR/Blob/scanning checks, telemetry
and audit correlation, approved alerts/on-call and cost-owner runbook, isolated
restore with hash/scan-state evidence and measured RPO/RTO. No foundation SLO is
claimed. Proposed 99.5% availability, p95 <750 ms, RPO 15 minutes and RTO four
hours remain unapproved/unverified; 99.5% time-based 30-day SLO would allow
216 minutes, not a permission to tolerate integrity/security failures.
Security/isolation failures halt promotion; exhausted error budgets freeze risky
releases. Follow existing database backup-retention and operations runbooks.

## Remaining approvals and rollback

Required: human diff/security authorization and ADR acceptance; network-owner
CIDRs/nonoverlap and NSG dependencies; finance/legal payer/cost owner and alerts;
external GitHub environment/branch protection and verified immutable-ID OIDC
subject; separate least-privilege preview/apply identities, separately approved
registration/RG bootstrap, SKU/quota/name checks, successful provider what-if,
human authorization of the prepared apply diff and exact immutable plan inputs.
External setup and actual operator manual no-bypass verification
for the exact SHA remain prerequisites; no live protections or approvals were
created by this preparation. The removal of independent review is specifically
approved above, not a waiver of these remaining prerequisites.
No execution route is enabled by this ADR.

Before provisioning, rollback is simply withholding activation/dispatch; source
unchanged. After a future approved build, retain evidence and stop on drift or
failed readiness. Deletion, including platform-managed RG cleanup, is a separate
human-approved operation. Do not auto-delete database/storage, flip DNS or migrate
data. ACA network type/subnet size and PostgreSQL VNet placement are consequential
creation-time constraints, not safely reversible parameter toggles.

## Official evidence

- [ACA VNet configuration and managed-resource charges](https://learn.microsoft.com/en-us/azure/container-apps/custom-virtual-networks)
- [ACA networking](https://learn.microsoft.com/en-us/azure/container-apps/networking)
- [ACA billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)
- [PostgreSQL delegated VNet/DNS/platform dependencies](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-networking-private)
- [ACA jobs networking and start-permission warning](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [USD Retail Prices API](https://prices.azure.com/api/retail/prices)
- [Load balancer pricing semantics](https://azure.microsoft.com/en-us/pricing/details/load-balancer/)
- [Private DNS pricing](https://azure.microsoft.com/en-us/pricing/details/dns/)
- [GitHub documented REST environment schema](https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json)
- [GitHub GraphQL schema: Environment and DeploymentProtectionRule](https://github.com/octokit/graphql-schema/blob/master/schema.graphql)
- [GitHub deployment protections and admin-bypass setting](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
