# ADR-007: AI Is Advisory and Governed

**Status:** Accepted
**Date:** 2026-09-14
**Owners:** Product/Security/Architecture

## Decision

AI may summarize, classify, draft, identify missing evidence, and answer with citations for records the actor is already authorized to see. AI cannot authorize, approve/reject, sign/activate/terminate, post/refund/reverse money, grant access, or conclusively verify.

## Consequences

AI outputs record source IDs, model/provider, policy version, time, and human action. Any resulting business change goes through the normal authorized command pipeline.
