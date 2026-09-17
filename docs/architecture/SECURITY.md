# Security Architecture

## Trust boundaries

- Browser and messaging input is untrusted.
- External identity proves a subject but does not grant organization access.
- During the single-tenant private pilot, external users must first redeem an
  Entra B2B guest invitation. That directory admission does not grant product
  access; organization membership still requires acceptance of the matching
  KEYFORTA invitation.
- Invitation acceptance uses Entra's explicit `email` claim. A transformed B2B
  `#EXT#` user principal name is not accepted as a verified recipient email.
- Application membership and policy determine authorization.
- Provider callbacks are authenticated, idempotent, and treated as replayable.
- AI output is untrusted input to deterministic application commands.

## RLS trust and policy topology

```mermaid
flowchart LR
  Subject[External subject<br/>identity only]
  Resolution[API actor and membership resolution]
  Authorization[Application authorization<br/>role, command, and resource checks]
  Context[Trusted transaction context<br/>organization, actor, correlation]
  Runtime[Restricted keyforta_runtime role]
  Forced[FORCE RLS and default deny<br/>when context is absent]
  OrgPolicy[Implemented organization policy]
  RelationshipPolicy[Normative target<br/>relationship policy]
  TimePolicy[Normative target<br/>effective-time policy]
  Rows[Organization-owned rows]
  Denial[Cross-organization denial]
  Audit[Correlated audit evidence]

  Subject --> Resolution
  Resolution --> Authorization
  Authorization -->|only after approval| Context
  Context --> Runtime
  Runtime --> Forced
  Context --> OrgPolicy
  Context -. target evidence .-> RelationshipPolicy
  Context -. target evidence .-> TimePolicy
  Forced --> OrgPolicy
  OrgPolicy -->|matching organization| Rows
  RelationshipPolicy -. bounded relationship .-> Rows
  TimePolicy -. active effective period .-> Rows
  OrgPolicy -->|mismatch or missing context| Denial
  Authorization --> Audit
  Context --> Audit
  Rows --> Audit
```

This is a trust-path view, not an authorization substitution. The implemented
organization policy and forced RLS provide database defense in depth after API
authorization; relationship- and effective-time policies remain normative
target controls where the executable migration lineage has not implemented
them.

## Required controls before external beta

- MFA for platform and landlord administrators
- Organization-scoped authorization on every command and query
- Row-level isolation as defense in depth
- Automated cross-organization access tests
- Private document storage and expiring authorized access
- Encryption in transit and at rest
- Upload validation and malware scanning
- Secret management through workload identity and a vault
- Correlation IDs, tamper-resistant audit events, metrics, traces, and alerts
- Backup restoration and incident-response exercises
- AI retrieval scoping, tool allowlists, structured output validation, prompt
  injection testing, and human approval for high-impact actions

## DAST runtime sequence

The `API security` workflow exercises the production persistence path on
loopback with synthetic data. Its ZAP scan is blocking, but its OpenAPI requests
are not authenticated and do not prove cross-organization behavior.

```mermaid
sequenceDiagram
  autonumber
  participant GH as API security job
  participant PG as Synthetic PostgreSQL 16
  participant MIG as Migration runner
  participant API as Production-mode API on 127.0.0.1
  participant SPEC as Rewritten OpenAPI contract
  participant ZAP as OWASP ZAP container
  participant ART as GitHub artifact

  GH->>PG: Start keyforta_dast service and await pg_isready
  GH->>GH: Frozen install and build API dependency graph
  GH->>MIG: Run apps/api/dist/migrate.js
  MIG->>PG: Apply forward migrations
  GH->>SPEC: Replace servers with loopback /api/v1
  GH->>SPEC: Assert production hostname is absent
  GH->>API: Start with NODE_ENV=production and synthetic identity config
  loop Up to 30 readiness attempts
    GH->>API: GET /ready
    API->>PG: Check database-backed readiness
    API-->>GH: ready or retry
  end
  GH->>ZAP: Run blocking zap-api-scan.py from rewritten OpenAPI
  ZAP->>API: Unauthenticated loopback API requests
  API-->>ZAP: Sanitized responses
  ZAP-->>GH: Exit status and JSON, HTML, Markdown reports
  alt Always, including failure
    GH->>API: Stop process group
    GH->>ART: Upload API log and ZAP reports for 14 days
  end
  Note over ZAP,ART: Not authenticated DAST and not cross-organization DAST
  Note over GH,PG: Those boundaries require deterministic API and PostgreSQL authorization tests
```

## Foundation and accepted target controls

Items described as future, target, or planned below are not implemented
capabilities. Current source and executable migrations control implementation
status.

- API bearer-token verification against the configured issuer, audience, and
  JWKS is required before protected browser routes are enabled.
- Future browser login uses authorization code with PKCE and direct API bearer
  tokens. Token storage requires security review before customer authentication
  is enabled; production CORS permits only the configured web origin.
- Landlord and manager workspace routes are selected from the API-resolved role.
  `/workspace` is the neutral entry;
  legacy `/pilot` URLs remain compatibility redirects, and browser input cannot
  select a role.
- Requested organization IDs are checked against active database membership;
  role permissions are then enforced in the application domain.
- Manager portfolio queries scope properties, units, and leases through active
  property assignments. Only landlords can mutate assignments, through a narrow
  database function that records actor and correlation evidence.
- Only landlords can configure property and unit lifecycle or append lease
  versions. Commands use trusted actor, organization, and correlation context;
  client-supplied resource IDs remain subject to application authorization and
  PostgreSQL row-level policies.
- Landlords grant manager or tenant membership through expiring, revocable
  invitations. Raw tokens are returned once and only SHA-256 hashes are stored;
  acceptance requires the authenticated identity email to match and derives the
  organization and role exclusively from protected server state. Lost pending
  links are replaced by revoking the old invitation and issuing a new one; raw
  tokens are never recovered from storage.
- Target lease activation will append an accepted version and leave every draft
  and prior version intact. It remains unimplemented; accepted leases must not
  be editable or archivable through landlord lifecycle commands.
- PostgreSQL policies default-deny organization-owned tables when trusted
  transaction context is absent.
- Payment idempotency keys and provider references are unique per organization.
- Posted payments, receipts, and ledger entries reject update and delete.
- Payment correction is limited to linked reversal or atomic
  reversal-and-replacement commands, preserving the original amount, actor,
  provider reference, and audit evidence.
- CI runs cross-organization tests against PostgreSQL and builds deployment
  artifacts without using deployment credentials.
- Production configuration fails fast without PostgreSQL or with a partial
  identity configuration; identity endpoints must use HTTPS.
- Server-generated correlation IDs identify sanitized error responses without
  trusting client-supplied identifiers or exposing internal failures.
- Container liveness and database-backed readiness probes prevent traffic from
  reaching API revisions that cannot serve persisted workflows.
- Manager and tenant identities are never created as ordinary landlord-owned
  records; membership begins only after secure invitation acceptance.
- Planned tenant applications are organization-scoped and editable only before
  submission. Landlord approval or refusal is an append-only human decision
  with reviewer, notes, timestamp, correlation, and audit evidence; it does not
  create a lease or reservation.
- Planned application evidence uses private Azure Blob Storage with shared keys and
  anonymous access disabled. The API validates size, MIME type, and file
  signature, stores an opaque Blob name and SHA-256, and records immutable
  organization-scoped metadata under forced RLS.
- Planned Microsoft Defender for Storage scanning keeps pending, failed,
  unscanned, or malicious files unavailable. After fresh authorization, only an
  exact clean result permits the short-lived signed URL required by ADR-006.
  Uploads and successful downloads remain correlated in the audit log.

## Sensitive data policy

Development and tests use synthetic data. Real identity documents, signed
leases, tenant communications, payment evidence, and production model
transcripts must never enter source control.
