# Suspected cross-organization access

- **Failure mode:** A subject may read or mutate data outside an authorized
   organization, relationship, assignment, or access window.
- **Detection and user impact:** Audit anomaly, user report, authorization-test
   failure, or unexpected row; potential privacy breach.
- **Severity and owner:** Critical; security and affected service owners.
- **Prerequisites / safe access:** Authorized incident access with sanitized
   application, identity, and database evidence.
- **Containment:** Disable the affected identity, route, or revision without
   destroying evidence.
- **Diagnosis commands (redacted outputs only):** Use approved organization-
   scoped audit, membership, application, and transaction-context queries for
   steps 2 and 3; do not place query output containing personal data in issues.
- **Recovery:** Restore the last verified revision or corrected authorization
   path only after application and RLS isolation checks pass.
- **Communication:** Notify security/privacy and service owners and follow the
   approved disclosure process.
- **Evidence to preserve:** Subject, organization context, membership,
   correlation ID, endpoint, record IDs, audit events, and revision SHA.
- **Rollback / stop conditions:** Stop investigation queries that could widen
   disclosure; do not restore until both application authorization and RLS pass.

1. Disable the affected identity or deployment revision and preserve access,
   application, and database audit evidence.
2. Record the authenticated subject, selected organization, resolved membership,
   correlation ID, endpoint, and affected record identifiers.
3. Verify application authorization and PostgreSQL transaction context
   independently. RLS is defense in depth, not proof of authorization.
4. Rotate credentials only when exposure is established; disable or replace
   managed identities and OIDC federated credentials at their source.
5. Notify the security owner, assess disclosure obligations, restore the last
   verified revision, and add a two-organization regression test.

- **Verification:** Same-organization success, cross-organization denial,
   missing-context denial, revocation, and non-disclosure tests pass.
- **Follow-up tests and review trigger:** Add the exact path to the reusable
   isolation proof and review every sibling data path.