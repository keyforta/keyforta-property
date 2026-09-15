# Runbook Index

Runbooks will be exercised before real pilot data is imported.

Every release follows the
[release and deployment checklist](RELEASE_CHECKLIST.md), including an
immutable evidence chain, post-deployment verification, and an initial
operating window.

1. Authentication or account-recovery incident
2. Suspected cross-organization access
3. Duplicate or unidentified payment
4. Incorrect charge schedule
5. Document exposure or malicious upload
6. AI grounding, prompt-injection, or tool-policy incident
7. Messaging provider outage
8. Backup restoration
9. Data export or deletion request

Use [`RUNBOOK_TEMPLATE.md`](RUNBOOK_TEMPLATE.md) for new procedures. The
[`authentication redirect mismatch`](AUTHENTICATION_REDIRECT_FAILURE.md)
runbook is the executable procedure for OIDC callback failures.

Every runbook must identify detection, severity, containment, owner,
communication, recovery, evidence preservation, and follow-up actions.

## Duplicate or unidentified payment

1. Preserve the correlation ID, provider reference, idempotency key, receipt,
   actor, and provider evidence. Do not edit a posted row.
2. Query by organization and provider reference. A repeated callback with the
   same lease, amount, and currency must return the original payment and receipt.
3. Treat a reused key or provider reference with different financial details as
   a high-severity integrity incident and stop automated reconciliation.
4. If a valid posting must be corrected, create a linked reversal and approved
   replacement in one transaction. Preserve the original posting.
5. Reconcile the balanced ledger and tenant statement, record the resolution,
   and add the exact callback shape to regression tests.

## Suspected cross-organization access

1. Disable the affected identity or deployment revision and preserve access,
   application, and database audit evidence.
2. Record the authenticated subject, selected organization, resolved membership,
   correlation ID, endpoint, and affected record identifiers.
3. Verify application authorization and PostgreSQL transaction context
   independently. RLS is defense in depth, not proof that access was authorized.
4. Rotate credentials only when exposure is established; managed identities and
   OIDC federated credentials should be disabled or replaced at their source.
5. Notify the security owner, assess disclosure obligations, restore service
   from the last verified revision, and add a two-organization regression test.

## Document exposure or malicious upload

1. Disable affected document downloads or the API revision and preserve the
   actor, organization, application, document, correlation, Blob tag, Defender
   alert, and audit evidence. Do not download a suspected file to a workstation.
2. Confirm the container is private, shared-key access is disabled, the API
   identity has only container-scoped data access, and the file was never
   returned before the exact `No threats found` result.
3. For malware, verify the blob is soft deleted and retain it only for the
   approved seven-day investigation window. Treat missing, failed, or
   `Not Scanned` results as unavailable, never as clean.
4. For exposure, revoke affected access, assess notification obligations, and
   use Blob and database audit records to establish the accessed versions.
5. Restore service only after an EICAR-based synthetic check proves scanning,
   Blob Index Tags, clean-only download, and malicious-file soft deletion.

## Deployment and migration failure

1. Stop promotion when `what-if`, image build, migration job, or BFF smoke test
   fails. Do not route traffic to an unvalidated revision.
2. Preserve the workflow run, commit SHA, deployment operations, migration-job
   execution, and Container Apps logs without copying tokens or connection data.
3. For application failure, move traffic to the previously validated immutable
   revision or redeploy its SHA-tagged images.
4. Database changes use forward corrective migrations. Restore only through an
   approved recovery decision when forward correction cannot preserve data.
5. Re-run the migration job; already recorded migration filenames are skipped.
   Then repeat health and same-origin BFF schedule-preview smoke checks.
