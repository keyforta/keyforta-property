# ADR-001: Start with a Modular Monolith

**Status:** Accepted
**Date:** 2026-09-14
**Owners:** Technology/Architecture

## Context

KEYFORTA needs clear domain boundaries, fast MVP delivery, and a small operational footprint. Early deployment as many independently operated services would add network, observability, deployment, and data-consistency complexity before scale or ownership requires it.

## Decision

Implement one deployed modular monolith with explicit domain modules and separate asynchronous job processing where needed. Each module owns its aggregates, persistence, public application ports, and events.

## Consequences

- Modules communicate through commands, queries, and published events.
- Private tables and persistence entities are not imported across modules.
- Extraction is allowed later when scale, regulation, provider coupling, or team ownership justifies it.
- Architecture tests must protect module boundaries.

## Revisit trigger

Revisit when a module needs independent availability/scaling, has a separate owner and release cadence, or creates a measurable operational bottleneck.
