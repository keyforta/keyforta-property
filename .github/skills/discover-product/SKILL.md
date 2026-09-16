---
name: discover-product
description: "Trace existing product behavior, users, and authoritative requirements. Use when exploring what KEYFORTA already promises before defining work."
---

# Discover Product

## Inputs

- Product question, affected users, and suspected implementation area.

## Procedure

1. Read the relevant sources under `docs/product/` and companion domain contracts.
2. Trace observable behavior through implementation, tests, and API contracts.
3. Distinguish implemented behavior, documented intent, proposals, and gaps.
4. Map affected users, business invariants, dependencies, and unresolved questions.
5. Record ambiguity in `docs/engineering/REQUIREMENTS_GAPS.md`.

## Guardrails

- Do not invent requirements, approve scope, or change runtime behavior.
- Treat authoritative product documentation as the source of truth.

## Completion

- Return sources, current behavior, affected users, constraints, and explicit gaps.

## Resources

- [Product requirements](../../../docs/product/PRD.md)
- [Domain contracts](../../../docs/keyforta-domain-contracts.md)
- [Requirements gaps](../../../docs/engineering/REQUIREMENTS_GAPS.md)