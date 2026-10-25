# ADR-016: Isolated company-development private database foundation

**Status:** Proposed ADR, external human acceptance pending; staged local implementation specifically owner-approved (not activated)

**Date:** 2026-10-25 UTC

**Owners/reviewers required:** Platform, Network, Security, Finance, repository maintainers
**Scope:** New empty company DEVELOPMENT foundation only; never production

## Approval evidence and limits

In the human-directed planning session, the user selected: **“Approve the
private-network design and raise the planning ceiling to $120/month before tax;
continue deployment preparation.”** This authorizes preparation of this direction,
not execution, provider registration, RG creation, roles, federation, billing or
workflow activation. It is not evidence that this ADR has received required
repository/external reviews. No acceptance date or reviewer sign-off is invented.
CIDRs and the detailed NSG rules still require network/security-owner approval.

The user subsequently selected **“Approve independent manual verification while
retaining GitHub required-reviewer protection.”** This approves replacing the
unsupported automated admin-bypass assertion with the native protected-environment
review procedure below, not provisioning authority, audit waiver or ADR acceptance.

The subsequent **“I approve”** records conditional authorization for the agreed
foundation-only provisioning after all prior prerequisites genuinely pass.
The isolated plan-bound apply implementation below is now prepared for external
review, not activated. This consent does not waive audit/security/reviews,
network-owner/payer inputs, native independent approvals or bootstrap authority;
no additional blanket authorization is requested. This ADR remains **Proposed**.

## Proposed staged company-foundation contract

The heading retains the proposal's historical anchor. The current authorization
is [explicit Product Owner approval](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6402966949)
for local implementation/tests of this staged contract, including **both**
reserved decisions: temporary **empty, unused** bootstrap Storage before
Defender, and **human removal of all bootstrap workflow writer authority before
human grants/security handoff**, including inherited/equivalent authority.
Continuation must never regain UAMI/ACR/Storage write authority.
This does not constitute full external ADR acceptance, Azure permission
sufficiency, activation, dispatch, deployment or permission/settings writes.
No second Azure technical sign-off is required; independent GitHub PR/native
human controls remain mandatory. Earlier proposal-only statements below record
history, not the current implementation authorization.

The [specific subsequent owner decision](https://github.com/keyforta/keyforta-property/issues/159#issuecomment-6403538260)
approves the **local code/test contract** for owner-confirmed, correlated harmless
synthetic functional verification alongside actual readable settings/identity/
permissions, replacing the unobservable internal Storage→scanner→Event Grid
mapping requirement. Internal topology remains **UNVERIFIED**. It grants **no
execution/upload authority**; a future manual synthetic test requires separate
authorization. Mutable Blob index tags are not a sole security control or
automated foundation-ready/data-admission proof. Native independent gates remain.

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
Required independent PR approvals and native environment gates remain unchanged:
human authorization/control checks, not Azure expertise certification or duplicate technical review.
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

### Stage 2 - human permissions and separate Defender verification

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
Retain native independent gates, initiator AND rerun-actor separation,
prevent-self-review, live UI bypass-off verification, exact-SHA checks and latest
CI/security/DAST success. Changed stage/evidence/permissions/attempt needs review.
No AI substitutes for human approval; no customer/app activation before security
verification and a future separately authorized synthetic scan-result proof.

### Acceptance map and current implementation boundary

Both protected routes now implement the staged contract, with a reachable local
synthetic bootstrap-checkpoint → owner handoff → protected continuation → fresh
reviewed no-PUT replay. This is **local implementation, not Azure readiness or
ADR acceptance**. Full effective/transitive/PIM authority and owner observations
are checked by the already-approved native-human procedure; JSON is not approval.
The small shared `company-development-state.mjs` is essential to use the same
read-only state/security/re-entry rules in both existing CLI routes, rather than
duplicate them. It is not another deployable, Bicep surface, service or tool.

| Requirement | Executable behavior / acceptance evidence | Remaining work / execution blockers |
| --- | --- | --- |
| R1 stage-selective templates | Three existing Bicep surfaces; seven bootstrap writes; nine continuation writes and existing bootstrap references. Actual compiled inventory/security tests protect PG16/B1ms/32 GiB Premium_LRS/seven-day/Entra-only, ACA Consumption and source/default payload digest, including full Defender 100 GB/index settings. Company stages never grant or write Defender/scanner. | No live capacity, eligibility or minimum ACA permission sufficiency claim. |
| R2 versioned evidence | Seven-file v2 plan, stage/mode/SHA/run/attempt/native context, exact baseline/expected inventory, complete nine-path dependency manifest and raw hashes. Continuation/re-entry bind predecessor checkpoint hash AND actual GitHub apply workflow/repository/main/manual run/attempt/artifact ID/name/expiry; checkpoint binds source/template/parameters and actual resources/original apply caller. Legacy/historical full plans fail. | Artifact IDs come from real metadata, not invented pre-upload IDs. Human references/hashes are review context, not issuer attestations or authenticated owner approval. |
| R3 actual state / human handoff | Typed resources/ARM operations reconstruct actual UAMI tenant/resource/principal/client IDs; manual-only deterministic four-grant preparation/idempotency never executes grants. Current direct/inherited grants, scanner identity/Data Owner, full on-upload/100 GB/index/no-exclusion settings and reviewed service inventory are read. Caller-context permission reads reject surviving bootstrap/security/data authority and bind original bootstrap apply SP. Owner functional record and all references are protected-context/hash-bound. | Machine scope is readable identities/settings/grants/current-caller permissions only. Owner/native review must establish equivalent/transitive/PIM rights removal, genuine observation and separate test authority. Hidden internal topology remains UNVERIFIED, not proved from names/tags/absence of errors. |
| R4 safe submission/re-entry | Initial bootstrap requires empty resources/history. Actual frozen baseline and terminal ARM operations, exact staged inventory, explicit canonical property-level Modify approvals and fresh matching what-if are required for recovery. Failed/canceled/unknown/running/timeouts stop without auto-retry/delete. Completed exact source/template/parameters/current resources plus fresh NoChange is no-PUT, including inspection after an unknown submission outcome. | Newly observed partial-bootstrap identities lack historical checkpoint continuity; owner must inspect creation/activity/operations under freeze. Recorded identities cannot be swapped/recreated. This is a human limitation, not fabricated machine continuity proof. |
| R5 native workflows | Two existing main/manual-only workflows, same concurrency, distinct federated identities, stage/mode/version/context inputs and explicit artifacts/checkpoint. Independent required reviewer, initiator/rerun-actor separation, prevent-self-review, exact SHA/run/attempt/environment ID/snapshot and live UI bypass-off review retained. RG caller permission reads check only documented template PUT types/deployment what-if/workspace-key action against stage allowlists. | Native controls and actual authority remain external. Known-operation checks explicitly return ACA minimum permission proof EXTERNAL_REQUIRED; they do not establish the complete custom-VNet backend permission contract. No broader grants or activation-variable changes. |
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
  preparation. Protect it with regression tests and independent review.
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
Require fresh exact-SHA CI, protected preview, hashes and independent apply
review. Existing independent/no-self-review/no-admin-bypass controls are not
waived; no OIDC, RBAC, GitHub environment setup, dispatch or provisioning occurs
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
fields before the OIDC-capable job: configured required reviewers, no self-review,
protected branches and actual environment IDs. Missing API access or protections
fails closed. The required **no-admin-bypass** setting is not exposed by the documented REST
Environment or GraphQL Environment/DeploymentProtectionRule schemas. Under the
explicitly approved manual-verification decision, the **native GitHub
`company-dev` required-reviewer gate is authoritative**; YAML cannot create
reviewers and a missing/invented bypass field proves nothing.

The pre-OIDC guard publishes review context: exact checkout SHA/run/attempt,
actual environment ID/node ID and normalized API-verifiable protection snapshot
hash. An independent configured GitHub reviewer other than the workflow initiator
(and re-run actor) must inspect the live environment, manually verify the bypass
setting is disabled, check that required CI/security/audit passed at that SHA,
and record the verification and exact SHA/run/attempt/environment ID/snapshot hash
in the native environment approval comment before approving. Reject missing
evidence, blocked checks, mismatches or changed settings. A new run attempt,
revision or environment change requires fresh review. Native prevent-self-review
remains mandatory; reviewer identity/approval is governed by GitHub, not a
homemade attestation or an actor-supplied boolean.

Only the job declaring `environment: company-dev` can reach Azure login, after
GitHub releases that gate. It re-reads supported API fields and compares the
snapshot and exact run/revision before login. Context outputs and hashes do not
attest manual completion; code does not parse comments or claim automated proof
of the UI-only setting. Manual-checklist enforcement remains an explicit external
reviewer responsibility. No unconditional stop or speculative evidence service
remains, and no repository activation flag substitutes for GitHub approval.

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
The same independent manual no-bypass procedure is required for that environment.
Before approval, the read-only guard publishes the exact SHA/run/environment
snapshot plus successful preview run/attempt/artifact ID and independently
reviewed source/template/parameter/what-if hashes. The protected job revalidates
that binding, actual environment snapshot, external approved CIDRs and distinct
principal before login. No repository flag or homemade reviewer record replaces
native required-reviewer approval.

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

Required: independent diff/security review and ADR acceptance; network-owner
CIDRs/nonoverlap and NSG dependencies; finance/legal payer/cost owner and alerts;
external GitHub environment/branch protection and verified immutable-ID OIDC
subject; separate least-privilege preview/apply identities, separately approved
registration/RG bootstrap, SKU/quota/name checks, successful provider what-if,
independent review of the prepared apply diff and exact immutable plan inputs.
External setup and actual independent GitHub review/manual no-bypass verification
for the exact SHA remain prerequisites; no live protections or approvals were
created by this preparation. The manual-review policy decision itself is approved.
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
