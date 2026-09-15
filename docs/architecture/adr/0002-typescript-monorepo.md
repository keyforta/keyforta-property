# ADR-0002: Use an End-to-End TypeScript Monorepo for the Pilot

- **Status:** Accepted for pilot; review before commercial beta
- **Date:** 2026-09-09

## Context

The first increment needs a low-overhead web experience, API, shared contracts,
deterministic domain code, fast tests, and one CI toolchain.

## Decision

Use pnpm workspaces and Turborepo with Next.js for the web application, Fastify
for the initial API, Zod at untrusted transport boundaries, and framework-free
TypeScript for domain rules.

## Consequences

- One language and package graph reduce pilot setup and contract duplication.
- Domain code remains portable because it does not depend on Fastify or Next.js.
- PostgreSQL persistence is intentionally deferred to a dedicated ADR after the
  data model and organization-isolation proof of concept.
- The decision can be revisited if scale, team skills, or enterprise integration
  justify a Java or .NET application service.
