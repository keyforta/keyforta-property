# Authentication redirect mismatch runbook

## Detection and severity

Trigger when Entra returns `AADSTS50011`, login loops, or the deployment OAuth
smoke test fails. Severity is high when all users are blocked, medium when limited
to a non-production callback. Owner: platform/SRE; security reviews unexpected
origins.

## Containment and diagnosis

1. Stop promotion; do not add an untrusted callback just to clear the error.
2. Preserve release SHA, workflow run, correlation/request IDs, timestamp, and the
   rejected URI. Do not preserve authorization codes, cookies, or tokens.
3. Read the live redirect without following it:
   `curl --fail --silent --show-error --dump-header - --output /dev/null https://<web-host>/api/auth/login`.
4. Decode only the `redirect_uri` query parameter from `Location`. It must equal
   `https://<web-host>/api/auth/callback` exactly.
5. Confirm the web revision has `AUTH_PUBLIC_BASE_URL=https://<web-host>` and that
   the same callback is registered for the Entra application. Check scheme, host,
   port, path, case, and trailing slash.

## Recovery

If the revision has the wrong origin, correct Bicep/configuration through a pull
request, run CI, review what-if, and deploy an immutable SHA. If Entra lacks the
correct known callback, an authorized identity administrator updates registration
through the approved external-system procedure and records evidence. Never add
`0.0.0.0`, internal API hosts, wildcard callbacks, or arbitrary tunnel URLs to a
production registration.

## Verification and rollback

Repeat the header check and complete one synthetic sign-in. The deployment smoke
test must prove the exact callback. Verify role resolution and logout without
recording tokens. If recovery fails, route traffic to the last verified revision
and reopen the incident. Add the observed mismatch to automated regression or
smoke evidence and review all environment callbacks.
