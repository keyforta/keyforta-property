## Requirement / issue
Closes #69.

## Before evidence (broken / missing)
Before this PR, the frontend apps and shared UI packages were not wired into the monorepo test gate:

```bash
$ git show origin/main:apps/admin-web/package.json | grep '"test"'
$ git show origin/main:apps/portal-web/package.json | grep '"test"'
$ git show origin/main:apps/public-web/package.json | grep '"test"'
$ git show origin/main:packages/auth/package.json | grep '"test"'
$ git show origin/main:packages/api-client/package.json | grep '"test"'
$ git show origin/main:packages/brand/package.json | grep '"test"'
```

All six commands returned no matches, so `turbo run test` skipped those app/package boundaries entirely. `apps/jobs` also had no `test` script and only scaffold `check` / `build` placeholders.

There was also no automated accessibility runner wired into any frontend app. On `origin/main`, these searches return no a11y runner usage:

```bash
$ rg -n "vitest-axe|jest-axe|axe\(" apps/admin-web apps/portal-web apps/public-web
```

## Failing test (red)
With the new suites added but before the implementation was corrected, the new tests failed for real missing/incompatible test wiring reasons:

```bash
$ pnpm --filter @keyforta/admin-web test
ReferenceError: Cannot access 'initializeMock' before initialization
```

```bash
$ pnpm --filter @keyforta/portal-web test
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name `/Report a maintenance issue/`
```

```bash
$ pnpm --filter @keyforta/public-web test
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@vitejs/plugin-react' imported from .../apps/public-web/.../vitest.config.js
```

These red runs proved the new coverage was not yet correctly wired and that the representative component/a11y assertions were exercising real behavior.

## After evidence (working)
The affected boundaries now expose test scripts and are picked up by the workspace gate:

```bash
$ pnpm test
Tasks:    17 successful, 17 total
```

Representative app/package coverage now exists for the requested surfaces:
- `apps/admin-web`: loading / empty / denied / error queue states, decision flow, and accessibility smoke test for the sign-in gate.
- `apps/portal-web`: signed-out login gate, legacy technician-to-operator session recovery, query-string handoff, navigation/action behavior, and accessibility smoke test.
- `apps/public-web`: loading / empty / error / not-found states across representative pages plus accessibility smoke test for the home page.
- `packages/auth`, `packages/api-client`, `packages/brand`: `node:test` coverage for all exports and error edges.
- `apps/jobs`: honest boundary tests for the existing scaffold scripts, with the rationale recorded in `docs/engineering/REQUIREMENTS_GAPS.md`.

Accessibility automation is now jsdom-based and CI-light (`vitest` + `@testing-library/react` + `vitest-axe`) so it runs inside the existing `pnpm verify` chain without browser downloads.

## Passing test (green)
```bash
$ pnpm --filter @keyforta/admin-web test
✓ test/OnboardingAdmin.test.jsx (6 tests)

$ pnpm --filter @keyforta/portal-web test
✓ test/portal.test.jsx (6 tests)

$ pnpm --filter @keyforta/public-web test
✓ test/public-web.test.jsx (5 tests)

$ pnpm --filter @keyforta/auth test
✔ auth surfaces declare login requirements per app boundary

$ pnpm --filter @keyforta/api-client test
✔ list attaches auth and organization headers
✔ throws enriched API errors for non-ok responses

$ pnpm --filter @keyforta/brand test
✔ brand exports the canonical palette and fonts

$ pnpm --filter @keyforta/jobs test
✔ check boundary explains the scaffold state
✔ build boundary explains the runtime is not configured yet

$ pnpm verify
Tasks:    8 successful, 8 total
```

## Tooling notes
- Chose `vitest` because it is already used in the monorepo (`apps/api`) and works for the Vite apps plus the client-rendered Next.js public app components.
- Chose `@testing-library/react` for behavioral DOM assertions and `vitest-axe` for automated accessibility smoke coverage without introducing Playwright/browser downloads.
- Kept `packages/auth`, `packages/api-client`, and `packages/brand` on the repository's established `node --test test/*.test.js` pattern used by `packages/authorization`.

## Scope note
`packages/authorization` already had complete coverage from #97, so this PR leaves it unchanged per issue guidance.

`apps/jobs` still has no runtime worker implementation. This PR adds deterministic boundary coverage for its current scaffold scripts and records the limitation in `docs/engineering/REQUIREMENTS_GAPS.md` instead of inventing fake job logic.


## Review follow-up
- Round 1 fixes: aligned the root manifest with the lockfile, updated `docs/engineering/TEST_STRATEGY.md` to record automated accessibility smoke coverage, removed the portal source-marker workaround by teaching the existing check to inspect `src/portal-app.jsx`, added a stale-role portal regression test, added `update` and `command` coverage for `@keyforta/api-client`, and re-enabled the full axe rule set in all three app accessibility tests.
