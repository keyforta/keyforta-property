# ADR-003: External Identity with Server-Side Authorization

**Status:** Accepted
**Date:** 2026-09-14
**Owners:** Security/Identity

## Decision

Use an external identity provider for authentication. KEYFORTA maps the validated issuer/subject to an internal party and evaluates all business authorization in the API.

## Consequences

The frontend may hide unavailable actions for usability, but it is never a security boundary. Tokens are not stored in domain tables. Changes to issuer, audience, claims, or onboarding flow require an ADR and contract update.
