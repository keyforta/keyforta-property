# Release and Deployment Checklist

This checklist tracks each KEYFORTA release from reviewed source through the
initial operating window. The Git commit SHA, pull request, CI run, deployment
run, migration execution, and Azure revision are the durable evidence chain.

## Release record

Create one record in the pull request or linked issue and keep it current.

| Field        | Required evidence                                      |
| ------------ | ------------------------------------------------------ |
| Outcome      | User-visible or operational result                     |
| Requirements | Linked `REQ-XXX` identifiers                           |
| Owner        | Person responsible for the release decision            |
| Commit       | Immutable full SHA from `main`                      |
| CI           | Successful workflow URL for that SHA                   |
| Deployment   | Approved `dev` workflow run URL                        |
| Migration    | Container Apps job execution name and final status     |
| Seed         | Optional seed workflow URL, execution name, and status |
| Revision     | API and web Container Apps revision names              |
| Smoke tests  | URLs tested, UTC time, and result                      |
| Observation  | End time and reviewer for the initial operating window |
| Rollback     | Previous validated SHA and revision                    |

Do not put credentials, access tokens, personal data, exact property addresses,
or tenant data in the record.

## Before merge

- Confirm the change is linked to requirements, acceptance tests, and current
  product documentation.
- Confirm authorization, organization isolation, audit behavior, and public
  projection boundaries for every changed data path.
- Run `pnpm verify`; CI must also pass with PostgreSQL integration tests enabled.
- Review dependency audit and container builds from CI.
- Review migration compatibility. Migrations are forward-only and must tolerate
  being re-run through the migration runner.
- Identify the previous validated deployment SHA and the signals that would
  stop or reverse the release.

## Deployment

1. Merge the reviewed pull request into `main`.
2. Dispatch `Deploy` with `operation=plan` for the immutable merge SHA.
3. On a fresh resource group, review the `foundation`-scoped plan and dispatch
   `operation=deploy-foundation` with its run ID. Then dispatch `operation=plan`
   again for the same SHA; do not deploy jobs or applications from a
   foundation-only plan.
4. Review all available Azure `what-if` results for deletes, replacements,
   public exposure, privilege expansion, and unexpected cost.
5. Dispatch the same SHA with `operation=deploy`, provide the reviewed `full`
   plan's workflow run ID, and approve the protected `dev` environment. The
   workflow must retrieve plan evidence whose artifact name, scope, contents,
   and run ID match that SHA before deployment can continue.
6. Confirm the deploy run repeats `what-if` for the foundation, database jobs,
   and applications so configuration drift remains visible.
7. Preserve the migration execution name and verify it reaches `Succeeded`.
8. Preserve the deployed application revision names and workflow summary.

The workflow must stop on a failed migration or smoke test. Never route around
an environment approval or replace a failed migration with manual SQL.

## Optional development data

After deploying the exact reviewed SHA, dispatch `Seed development data` from
`main`, enter `synthetic-dev-data`, and approve the protected `dev`
environment. Record the workflow URL and Container Apps execution name. The
operation is idempotent and contains only synthetic public catalogue data; it
must never be used for production or replaced with ad hoc database commands.

## Post-deployment verification

- Verify the home page and `/locations` through the public web endpoint.
- Verify the lease-schedule BFF returns the approved deterministic calculation.
- Confirm the catalogue returns only explicitly published fields and does not
  fall back to synthetic development listings.
- Test one authorized request and one denied cross-organization request when
  identity configuration is available.
- Inspect API and web logs for errors, correlation IDs, secret leakage, and
  unexpected personal data.
- Confirm API liveness remains healthy and database-backed readiness remains
  ready on every active revision.
- Confirm the previous application revision remains available for rollback.

## Initial operating window

For the first 30 minutes after deployment, review request failures, container
restarts, migration errors, database authentication failures, and public-page
availability. Record the outcome in the release record before declaring the
release complete.

If an application regression occurs, route traffic to the previous validated
immutable revision. If a schema issue occurs, stop promotion and apply a
reviewed forward corrective migration. Never edit or delete posted financial
history during recovery.
