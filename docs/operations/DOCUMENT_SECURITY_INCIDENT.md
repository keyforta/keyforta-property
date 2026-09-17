# Document exposure or malicious upload

This procedure is inactive until document upload and scanning are implemented.
Accepted ADR-006 controls download authorization; candidate architecture records
do not override it.

- **Failure mode:** Private-document exposure, malicious upload, or missing,
   stale, failed, or ambiguous scan result.
- **Detection and user impact:** Defender alert, Blob tag mismatch, access audit,
   or user report; possible malware or personal-data disclosure.
- **Severity and owner:** Critical for exposure, high for contained malware;
   security/privacy and document-service owners.
- **Prerequisites / safe access:** Approved incident identity, private storage
   access, and redacted metadata only. Never download a suspected file locally.
- **Containment:** Disable affected document access or the API revision and
   preserve storage, scan, authorization, and audit evidence.
- **Diagnosis commands (redacted outputs only):** Inspect approved private Blob
   metadata, Blob Index Tags, Defender status, authorization audit, and revision
   logs through approved tools; never retrieve document contents locally.
- **Recovery:** Revoke exposed access or contain the malicious object, then
   restore the corrected access path only after the verification below passes.
- **Communication:** Notify security/privacy, service, and legal owners under the
   approved incident process.
- **Evidence to preserve:** Actor, organization, document/version, correlation
   ID, opaque object key, Blob Index Tags, Defender result/time, revision, and
   access audit. Never copy document contents into an issue.
- **Rollback / stop conditions:** Missing, pending, failed, `Not Scanned`, or
   non-exact scan results are unavailable, never clean. Stop if fresh
   authorization or object/version identity cannot be proven.

1. Disable affected document access or the API revision and preserve actor,
   organization, document, correlation, storage, scan, and audit evidence. Do
   not download a suspected file to a workstation.
2. Confirm anonymous and shared-key access are disabled and the API identity has
   only approved container-scoped data access.
3. Permit access only for the exact approved clean result after fresh
   authorization; accepted ADR-006 requires a short-lived signed URL.
4. For malware, verify approved soft deletion and preserve the object only for
   the approved investigation period. The candidate seven-day period is not
   active until retention approval exists.
5. For exposure, revoke affected access and assess notification obligations.

- **Verification:** Approved EICAR-based synthetic checks prove Blob Index Tags,
   scan gating, exact-clean handling, fresh authorization, short-lived access,
   and malicious-file containment.
- **Follow-up tests and review trigger:** Add the incident shape to evidence
  authorization, malware, retention, and audit tests; review on storage,
  scanning, access, or retention changes.