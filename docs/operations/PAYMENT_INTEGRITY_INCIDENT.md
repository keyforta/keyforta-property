# Duplicate or unidentified payment

- **Failure mode:** Duplicate, altered, or unidentified payment evidence.
- **Detection and user impact:** Conflicting provider reference, idempotency key,
   receipt, balance, or statement.
- **Severity and owner:** High; finance and service owners.
- **Prerequisites / safe access:** Authorized organization-scoped query access;
   redacted outputs only.
- **Containment:** Stop automated reconciliation for the affected organization
   and provider path.
- **Diagnosis commands (redacted outputs only):** Use approved organization-
   scoped lookups by provider reference, idempotency key, payment, receipt, and
   ledger identifiers for steps 2 and 3.
- **Recovery:** Append an approved linked reversal and replacement when needed,
   then reconcile both statements; never mutate the original posting.
- **Communication:** Notify finance, service, and security owners; do not include
   payment details in tickets.
- **Evidence to preserve:** Correlation ID, provider reference, idempotency key,
   receipt ID, actor, timestamps, and provider evidence.
- **Rollback / stop conditions:** Never edit or delete a posted row; stop when
   balanced-ledger or organization scope cannot be proven.

1. Preserve the correlation ID, provider reference, idempotency key, receipt,
   actor, and provider evidence. Do not edit a posted row.
2. Query by organization and provider reference. A repeated callback with the
   same lease, amount, and currency must return the original payment and receipt.
3. Treat a reused key or provider reference with different financial details as
   a high-severity integrity incident and stop automated reconciliation.
4. Correct a valid posting only through a linked reversal and approved
   replacement transaction. Preserve the original posting.
5. Reconcile the balanced ledger and tenant statement, record the resolution,
   and add the exact callback shape to regression tests.

- **Verification:** Original and correction remain linked, ledger balances, and
   tenant/landlord statements agree.
- **Follow-up tests and review trigger:** Add the redacted callback shape and
   cross-organization denial case; review provider reconciliation controls.