---
description: "Use when changing PostgreSQL migrations, deployment workflows, identities, or infrastructure operations."
applyTo: ["docs/database/**", ".github/workflows/**"]
---

# Infrastructure rules

Use Bicep, managed identities, least privilege, immutable image tags, and plan
before deploy. Migrations are forward-only and must preserve immutable history;
destructive changes require an approved recovery plan. Document cost and rollback.
Never provision, deploy, alter external systems, or weaken a gate without explicit
human approval. Compile affected Bicep and run `pnpm verify`.
