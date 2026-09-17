# Deployment or migration failure

- **Failure mode:** Plan, build, scan, drift, migration, deployment, or smoke
   verification fails.
- **Detection and user impact:** Blocking workflow failure or unhealthy revision;
   release stopped or service degraded.
- **Severity and owner:** High; release, service, data, and SRE owners.
- **Prerequisites / safe access:** Reviewed SHA-bound plan, GitHub run evidence,
   authorized Azure access, and the previous validated revision.
- **Containment:** Stop promotion and keep traffic away from unvalidated
   revisions.
- **Diagnosis commands (redacted outputs only):** Inspect the SHA-bound GitHub
   workflow, normalized `what-if`, migration, Container Apps revision, and smoke
   logs through approved tools; never copy credentials or connection data.
- **Recovery:** Restore the previous validated immutable application revision;
   correct database schema only with an approved forward migration.
- **Communication:** Notify release and affected service/data owners with run
   URLs and sanitized status only.
- **Evidence to preserve:** Commit SHA, run IDs, image digests, attestations,
   workflow scan logs, `what-if`, migration execution, revision, and smoke logs.
- **Rollback / stop conditions:** Application revisions may roll back; database
   schema uses forward correction. Stop if evidence or previous digest cannot be
   verified.

1. Stop promotion when `what-if`, image build, attestation, vulnerability scan,
   migration, or smoke verification fails. Do not route traffic to an
   unvalidated revision.
2. Preserve the workflow run, commit SHA, image digests, SBOM/provenance,
   workflow scan logs, `what-if`, migration execution, and Container Apps logs
   without copying credentials or connection data.
3. For application failure, restore the previously validated immutable revision
   or its reviewed digest-addressed images.
4. Correct database changes with forward migrations. Restore data only through
   an approved recovery decision when forward correction cannot preserve it.
5. Repeat migrations and smoke verification; recorded migration filenames are
   skipped by the checksummed runner.

- **Verification:** Normalized `what-if`, migration, health, CORS, and selected
   application smoke checks pass for the reviewed SHA and scope.
- **Follow-up tests and review trigger:** Add the failure mode to workflow control
   tests and review release/rollback guidance after workflow or migration changes.