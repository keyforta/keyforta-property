---
description: "Use when changing task contracts, harness policies, graders, fixtures, evidence, or canonical verification."
applyTo: "harness/**"
---

# Harness rules

Keep checks deterministic, offline-first, dependency-light, and nonzero on failure.
Never encode new product behavior in repository-neutral fixtures. Reports must
separate passed, failed, and skipped gates. Core schemas and policies are protected;
changes require explicit task-contract approval and independent review. CI and local
verification must call the same scripts.
