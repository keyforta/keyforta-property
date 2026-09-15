# Observability conventions

This is the implementation contract for future telemetry work; it does not claim
instrumentation that is not present.

## Signals

- Emit structured request start/end and sanitized failure events with timestamp,
  environment, release SHA, service, route template, method, status class,
  duration, and server-generated correlation ID.
- Propagate W3C `traceparent` across web BFF, API, database, Blob, identity, and
  provider adapters when OpenTelemetry is introduced.
- Measure request rate, duration, error ratio, dependency duration/failure,
  readiness, migration outcome, document-scan state age, payment idempotency
  conflicts, and queue/outbox age where those capabilities exist.
- Dashboards map directly to approved SLIs in `docs/operations/SLOS.md`. Alerts
  must be actionable, routed to an owner, and linked to a runbook.

## Data safety

Never log tokens, cookies, secrets, request/response bodies, identity documents,
raw payment credentials, invitation tokens, tenant names, emails, phone numbers,
or free-form model transcripts. Do not use organization, actor, lease, document,
or correlation IDs as metric labels. Correlation IDs may be searchable structured
log fields with approved retention. Record authorization outcomes and resource
types, not sensitive resource content.

## Review triggers

Telemetry packages, exporters, sampling, retention, paid Azure resources, new
business metrics, or cross-region export require architecture, security/privacy,
platform/SRE, and owner review. Product metrics must derive only from approved
requirements.
