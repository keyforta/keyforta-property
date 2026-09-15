# ADR-0001: Start with a Modular Monolith

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

The product has one initial technical owner, a small private pilot, uncertain
workflow details, and strict consistency needs around leases and money.

## Decision

Deploy one application API with internally enforced domain modules and
asynchronous workers. Modules expose application commands, queries, and events;
they do not access each other’s internal persistence directly.

## Consequences

- End-to-end changes and transactions remain simple during discovery.
- Operational cost and failure modes stay proportionate to the pilot.
- Module boundaries permit later service extraction when independent scaling,
  deployment, regulation, or team ownership creates measurable value.
- Architecture tests and review must prevent accidental coupling.
