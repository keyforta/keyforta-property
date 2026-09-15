# ADR-004: Ledger Is Separate from Payment Providers

**Status:** Accepted
**Date:** 2026-09-14
**Owners:** Finance/Architecture

## Decision

KEYFORTA's billing ledger is authoritative for assessed obligations and posted financial effects. Payment providers supply attempts, references, settlements, and callbacks; they do not own KEYFORTA balances.

## Consequences

- Provider callbacks are verified, replay-protected, and idempotent.
- Payments are allocated through domain commands.
- Posted entries are immutable and corrected with reversals/replacements.
- Reconciliation exceptions remain visible until resolved.
- USD and CDF remain in their original currency unless an approved FX policy exists.
