# ADR-0003: Use Fluent UI v2 for Product Interfaces

- **Status:** Accepted
- **Date:** 2026-09-10

## Context

KEYFORTA needs a consistent, accessible component system for dense rental
operations across desktop and mobile. Hand-styled controls had inconsistent
focus, disabled, loading, spacing, and interaction states.

## Decision

Use Fluent UI React v9, Microsoft's React implementation of Fluent 2, for shared
interactive controls in the web application. Apply a KEYFORTA theme through a
single root `FluentProvider`. Use official Fluent icons and preserve semantic
HTML for composite domain-specific controls when a generic component would
reduce clarity.

## Consequences

- Buttons, inputs, selects, badges, loading states, and focus behavior share one
  accessible implementation.
- Product colors and typography remain centralized in the application theme.
- Domain workflows and authorization remain independent of the component
  library.
- Existing screens can migrate incrementally while new product controls use
  Fluent components by default.
