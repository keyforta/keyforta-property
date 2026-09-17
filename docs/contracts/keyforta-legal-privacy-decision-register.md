# KEYFORTA Legal, Privacy, and DRC Decision Register

**Status:** Implementation policy register v1.0; legal approval required before commercial launch
**Jurisdiction baseline:** Democratic Republic of the Congo, Kinshasa pilot (`CD-KN`)
**Important:** This register does not provide legal advice or replace qualified DRC counsel.

## 1. Decision status vocabulary

- **Approved implementation policy:** engineering may implement the rule as written; this status does not claim that implementation exists.
- **Configurable pending approval:** engineering may implement the policy mechanism, but must not hard-code the value or claim legal compliance.
- **Legal blocker:** commercial behavior must not be enabled until the named owner and qualified counsel approve it.

## 2. Decisions

| ID | Decision | Implementation rule | Status | Owner/evidence |
| --- | --- | --- | --- | --- |
| LEG-001 | Pilot jurisdiction | Store `CD-KN` on the organization/property and select a versioned jurisdiction policy. | Configurable pending approval | Product + DRC counsel: applicable-law memo |
| LEG-002 | Lease terms | Lease terms are versioned; signed terms are immutable; activation requires required acknowledgements/signatures. | Approved implementation policy | Product/legal: approved lease template and signing method |
| LEG-003 | Deposit and advance rent | Store deposit and advance rent separately in original currency; validate limits through jurisdiction policy, not code constants. | Legal blocker for commercial launch | DRC counsel: approved limits and handling rules |
| LEG-004 | Rent due, grace, late fees | Store due day, grace period, and fee policy version per lease. Do not assess fees until policy is approved. | Configurable pending approval | Finance + DRC counsel: fee/notice policy |
| LEG-005 | Termination and notice | Require effective date, reason, policy version, and recorded notice document; prevent unsupported automatic termination. | Legal blocker for commercial launch | DRC counsel: termination/notice rules |
| LEG-006 | Tenant screening | Collect only approved fields/evidence; record consent and decision reason; do not auto-reject or use opaque AI scoring. | Configurable pending approval | Product/privacy + counsel: screening policy |
| LEG-007 | Property verification | Verification confirms review of submitted evidence; it does not represent a government title determination. | Approved implementation policy | Platform/legal: evidence checklist and disclaimer |
| LEG-008 | E-signature | Store exact terms hash, signer identity, timestamp, consent, and evidence. Do not rely on a signature workflow until legal validity is confirmed. | Legal blocker for commercial launch | DRC counsel: acceptable e-signature/evidence standard |
| LEG-009 | Privacy notice and consent | Consent is versioned, purpose-specific, revocable where applicable, and recorded with timestamp and locale. | Legal blocker for commercial launch | Privacy owner + counsel: approved French/English notice |
| LEG-010 | Data minimization | Collect only fields required for a documented product purpose; sensitive evidence is isolated and excluded from ordinary lists/logs. | Approved implementation policy | Security/privacy owner: data inventory |
| LEG-011 | Retention and deletion | Preserve financial, lease, audit, and legal-hold records; implement policy-driven retention and anonymization after counsel approval. | Legal blocker for commercial launch | Privacy + counsel: retention schedule |
| LEG-012 | Data subject requests | Provide a controlled request workflow for access, correction, export, and deletion/anonymization subject to legal exceptions. | Configurable pending approval | Privacy owner: approved request procedure |
| LEG-013 | Cross-border hosting | Azure-first deployment is permitted as an architectural direction, but data location, transfer, vendor terms, and access must be reviewed. | Legal blocker for production data | Security/privacy + counsel: hosting/transfer review |
| LEG-014 | Payment records | Cash, bank transfer, and mobile-money records retain original currency and source/reference. Provider automation is isolated from the ledger. | Approved implementation policy | Finance: reconciliation procedure |
| LEG-015 | Payment compliance | Do not claim regulated payment-service status; provider KYC/AML, settlement, refund, and chargeback responsibilities require provider and counsel review. | Legal blocker for commercial payments | Finance + counsel/provider: compliance assessment |
| LEG-016 | Messaging consent | Record communication channel, purpose, consent/relationship basis, delivery state, and opt-out where applicable. | Configurable pending approval | Privacy/communications owner: approved messaging policy |
| LEG-017 | Maintenance access | Operator access is least-privilege, job-scoped, time-bounded, logged, and revocable. | Approved implementation policy | Security + operations |
| LEG-018 | Support access | Support access requires reason, target, scope, approver, expiry, customer visibility, and audit record. | Approved implementation policy | Security/platform owner |
| LEG-019 | AI assistance | AI is advisory/read-only unless an authorized human executes a normal command; source records, model, policy, and human action are recorded. | Approved implementation policy | Security/product owner |
| LEG-020 | Children and vulnerable persons | Do not intentionally collect child data in the MVP; route any exceptional case to a documented privacy/legal review. | Approved implementation policy | Product/privacy owner |

## 3. Commercial blocker approval records

[Issue #48](https://github.com/keyforta/keyforta-property/issues/48) tracks
collection of the approval records below; it is not approval evidence. The
repository does not currently identify the individual approvers or contain the
required dated evidence. The role descriptions below identify who must be
assigned, not who has approved a decision.

| ID | Required approving owner(s) | Evidence reference | Decision date | Status |
| --- | --- | --- | --- | --- |
| LEG-003 | Named qualified DRC counsel; named product and finance owners must also accept the commercial rule | Not provided | Not recorded | Legal blocker for commercial launch |
| LEG-005 | Named qualified DRC counsel; named product owner must also accept the commercial rule | Not provided | Not recorded | Legal blocker for commercial launch |
| LEG-008 | Named qualified DRC counsel; named product and security owners must also accept the signing and evidence controls | Not provided | Not recorded | Legal blocker for commercial launch |
| LEG-009 | Named privacy owner and named qualified DRC counsel; named product and security owners must also accept the operational controls | Not provided | Not recorded | Legal blocker for commercial launch |
| LEG-011 | Named privacy owner and named qualified DRC counsel; named product and security owners must also accept the operational controls | Not provided | Not recorded | Legal blocker for commercial launch |
| LEG-013 | Named security and privacy owners and named qualified DRC counsel; named product owner must also accept the hosting boundary | Not provided | Not recorded | Legal blocker for production data |
| LEG-015 | Named finance owner and named qualified DRC counsel; named product and security owners and the selected provider must also accept their responsibilities | Not provided | Not recorded | Legal blocker for commercial payments |

No row may move out of a blocking status until its evidence reference identifies
the approved artifact and records every named human approver and decision date.
Product approval of a synthetic hypothesis does not satisfy qualified-counsel or
functional-owner approval.

## 4. Required policy configuration

The backend must model these as versioned policy records rather than constants:

```text
jurisdiction_policy
lease_template_policy
deposit_policy
advance_rent_policy
notice_termination_policy
late_fee_policy
screening_policy
verification_policy
consent_policy
retention_policy
communication_policy
payment_compliance_policy
ai_use_policy
```

Each policy has `policyKey`, `jurisdictionCode`, `version`, `status`, `effectiveFrom`, `effectiveTo`, `approvedBy`, `approvedAt`, `sourceReference`, and a structured rule payload. A policy cannot become active without an owner decision and required legal approval flag.

## 5. Minimum privacy inventory

| Data class | Examples | Default access |
| --- | --- | --- |
| Identity | External subject, name, email, phone | Self and authorized operational users |
| Household/application | Occupants, income, references, consent | Applicant and authorized landlord/manager |
| Financial | Charges, payments, allocations, ledger entries | Tenant own records; finance/owner scope |
| Legal/lease | Signed terms, acknowledgements, notices | Lease parties and authorized scope |
| Property | Address, unit facts, publication data | Public-safe subset; private full record by scope |
| Maintenance | Description, schedule, quote, report, evidence | Request participants and active operator assignment |
| Communications | Messages, delivery metadata | Conversation participants and authorized support |
| Audit/support | Actor, target, reason, before/after metadata | Security/platform and approved support scope |
| AI metadata | Sources, model, policy, output, human action | Authorized users; no hidden expansion |

## 6. Legal release gate

The backend may be implemented before all legal decisions are final. Production commercial launch may not enable lease execution, screening, regulated payment automation, or jurisdiction-specific notices until the relevant `Legal blocker` records have signed approval evidence. The software must fail closed or route to manual review when the required policy version is absent.

## Appendix A. Engineering privacy baseline

This appendix provides supporting engineering guidance. Approved legal
decisions and the register entries above control if this baseline differs from
them. Record-specific retention timing remains unresolved under `LEG-011`; do
not promise deletion timing until the product, privacy, and legal owners approve
the retention schedule.

Data minimization, purpose limitation, organization isolation, and human review
apply to identity, tenancy, property, contractual, financial, communication,
document, audit, and future model data. Use synthetic fixtures and never copy real
records, documents, payment details, or transcripts into source, issues, prompts,
or test evidence.

Collect only fields required by approved contracts. Restrict access by role,
organization, assignment, and resource. Keep evidence private and scan-gated;
keep access and decision evidence correlated. Exports and deletion requests must
be authenticated, authorized, auditable, and account for immutable financial/legal
records and backups. Do not promise deletion timing until the product, privacy,
and legal owners approve the record-specific retention schedule recorded as a gap.

Privacy review is required for new fields, telemetry, providers, regions, model
usage, exports, retention changes, or broader support access. Threat-model the data
flow, identify controller/processor ownership, document retention and recovery,
and test denial and cross-organization isolation before release.
