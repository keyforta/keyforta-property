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

## Implemented foundation

- API bearer tokens are verified against configured issuer, audience, and JWKS.
- Browser login uses authorization code with PKCE; access tokens remain in
  short-lived, HTTP-only, same-site cookies and are forwarded only by the BFF.
- Landlord and manager workspace routes are selected and enforced by the Next.js
  server proxy from the API-resolved role. `/workspace` is the neutral entry;
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
- Lease activation appends an accepted version and leaves every draft and prior
  version intact. Accepted leases cannot be edited or archived through the
  landlord lifecycle commands.
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
- Tenant applications are organization-scoped and editable only before
  submission. Landlord approval or refusal is an append-only human decision
  with reviewer, notes, timestamp, correlation, and audit evidence; it does not
  create a lease or reservation.
- Application evidence uses private Azure Blob Storage with shared keys and
  anonymous access disabled. The API validates size, MIME type, and file
  signature, stores an opaque Blob name and SHA-256, and records immutable
  organization-scoped metadata under forced RLS.
- Microsoft Defender for Storage scans each upload. Pending, failed, unscanned,
  or malicious files cannot be downloaded; an authorized API-proxied download
  is available only for the exact clean result. Uploads and successful downloads
  are correlated in the audit log.

## Sensitive data policy

Development and tests use synthetic data. Real identity documents, signed
leases, tenant communications, payment evidence, and production model
transcripts must never enter source control.
