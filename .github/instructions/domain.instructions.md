---
description: "Use when changing contracts, authorization, money, leases, payments, or domain invariants."
applyTo: ["packages/contracts/**", "packages/authorization/**", "packages/auth/**"]
---

# Domain rules

Keep these packages deterministic and free of transport, persistence, framework,
Azure, and model-provider dependencies. Represent money as integer minor units.
Test positive, negative, boundary, and cross-organization cases. Business-rule
changes require approved requirements and product-owner approval.
