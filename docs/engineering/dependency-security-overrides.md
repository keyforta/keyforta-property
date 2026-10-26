# Targeted dependency security overrides

## Azure Identity 4.13.3 / MSAL Node 7.1.0

The override in `pnpm-workspace.yaml` is deliberately parent- and version-scoped:

```yaml
'@azure/identity@4.13.3>@azure/msal-node': 7.1.0
```

It addresses **GHSA-xcx6-jx8p-x3h5** in the API's Azure PostgreSQL token
acquisition dependency chain. MSAL Node 6.0.0 is affected; the advisory's minimum
patched version is 7.1.0. This does not override other MSAL consumers.

**Supported-range deviation:** Azure Identity 4.13.3 declares MSAL Node
`^6.0.0`. Version 7.1.0 is outside that range. Latest stable Azure Identity
4.14.0 also declares `^6.0.0`, so updating it alone does not fix the advisory.
Human authorization permitted investigation and compatibility testing; it is
not an upstream support guarantee, security waiver, or release approval.

### Compatibility evidence and limits

- Both MSAL versions declare Node `>=20`; no Node, TypeScript, or platform
  migration is introduced.
- Public npm tarball declarations for `ManagedIdentityApplication`,
  `ManagedIdentityRequestParams`, `Configuration`, `PublicClientApplication`,
  and `ClientCredentialRequest` are byte-identical between 6.0.0 and 7.1.0.
- Upstream v7's documented breaking change removes `responseMode` from
  interactive browser-loopback authentication. The API database path uses
  `ManagedIdentityCredential` or `DefaultAzureCredential`, not interactive
  browser login. This does not assert compatibility for all Azure Identity
  credentials or optional broker plugins.
- `apps/api/test/azure-identity-compatibility.test.ts` runs actual Azure Identity
  and MSAL implementations. Only the public HTTP transport returns synthetic
  responses; SDK constructors and token methods are not mocked.
- Coverage includes user-/system-assigned managed identity, resource and client
  selection, managed-identity headers, cached tokens, expired-token renewal,
  default-chain managed identity through the PostgreSQL password callback,
  default-chain environment/client-credentials token acquisition, rejection of
  unapproved tenant switches, endpoint refusal, and empty tokens.
- Child processes isolate MSAL's process-wide source/transport and token cache.
  Tests do not modify private SDK fields, use real credentials, launch credential
  CLIs, open network sockets, or contact Azure.
- Synthetic transport validation cannot prove a live Azure deployment's
  endpoint availability, managed-identity assignment, RBAC, PostgreSQL Entra
  configuration, or private networking. Those remain separate deployment gates;
  no deployment is performed or approved here.

Validation on the scoped 7.1.0 resolution: **8/8 credential compatibility
tests**, **224/224 API tests with real local PostgreSQL**, API TypeScript
contracts, production build, and a complete `pnpm verify` run passed. The actual
`pnpm audit --audit-level high` returned exit 0 with **0 high / 0 critical**;
18 moderate and 7 low findings remain. The accepted scope is a tested local
security remediation for the consumed credential paths, not general upstream
support for substituting MSAL 7 throughout Azure Identity. A later shared-tree
verify encountered newly added, concurrently owned foundation-source workflow
tests; the handoff preserves that failure separately. A current green shared-tree
verify is still required before any release decision. Specialist review is
optional under [the specialist-review policy](../../AGENTS.md#specialist-review-policy);
configured external GitHub controls and human release authorization still apply.

### Removal and review criteria

Remove this override when an upstream Azure Identity version declares a
dependency range that includes an advisory-patched MSAL release. In that change:

1. Confirm the actual selected MSAL version resolves this advisory without the
   override; do not merely delete the override or accept a vulnerable downgrade.
2. Update the exact reviewed-version regression and rerun the credential/token
   compatibility tests, API authorization/isolation/integration suites, actual
   `pnpm audit --audit-level high`, production build, and `pnpm verify`.
3. Recheck upstream migration notes, runtime requirements, and consumed API
   contracts. A new major, SDK flow, or broker/plugin requires its own review.
4. Request specialist review of the actual diff when requested or useful under
   [the specialist-review policy](../../AGENTS.md#specialist-review-policy).
   Do not broaden the selector
   or retain an unsupported override silently across Azure Identity upgrades.

Keep the existing high-severity audit gate and all authorization, organization
isolation, transaction, audit-ID, idempotency, money, and AI-safety invariants.

### Upstream references

- [GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5)
- [MSAL Node upstream changelog](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/CHANGELOG.md)
- Public npm tarballs:
  `https://registry.npmjs.org/@azure/msal-node/-/msal-node-6.0.0.tgz` and
  `https://registry.npmjs.org/@azure/msal-node/-/msal-node-7.1.0.tgz`.
