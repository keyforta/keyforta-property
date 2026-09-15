---
description: "Use when changing Fastify routes, persistence gateways, authentication, authorization, or API tests."
applyTo: "apps/api/**"
---

# API rules

Validate public input with shared contracts. Authorize organization, actor, role,
and resource at the application boundary; keep RLS as defense in depth. Thread a
correlation ID through writes and audit events. Keep controllers thin, external
callbacks idempotent, errors sanitized, and tests synthetic. Add cross-organization
integration coverage for every new data path.
