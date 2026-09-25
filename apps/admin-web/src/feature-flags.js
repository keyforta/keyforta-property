// Single source of truth for whether the flag-gated Admin redesign
// (docs/product/ADMIN_REDESIGN_SPEC.md) is reachable. Mirrors
// `apps/portal-web/src/feature-flags.js`'s already-reviewed
// `isLandlordRedesignEnabled` predicate line-for-line — same reasoning,
// same env-var name (`VITE_REDESIGN_ENABLED`, spec §8f: reusing the exact
// string all three prior phases used, not inventing an Admin-specific
// successor), same dev/preview-only gate.
//
// Deliberately a plain string comparison against the literal `'true'`
// (never a generic truthiness check) so an accidentally-set empty string,
// `'0'`, or `'false'` value cannot enable the flag.
//
// Gate on Vite's own DEV/MODE signals as well (`import.meta.env.DEV` /
// `MODE === 'preview'`), so the route is unreachable in a production
// build/mode by construction, independent of the env var's value —
// spec §8e(i)'s non-negotiable constraint ("no dev-only bypass may be
// reachable ... when the app is built/deployed for a non-development
// environment"), which is even more security-sensitive for `apps/admin-
// web` than any prior phase (spec §8e).
//
// Deliberately lives OUTSIDE `src/redesign/admin/` (same reasoning as
// `apps/portal-web/src/feature-flags.js`'s own header comment, Copilot
// PR #134 review, cycle-4 finding #1): `OnboardingAdmin.jsx` imports this
// module statically (eagerly) to decide whether to even attempt the
// `lazy(() => import('./redesign/admin/index.jsx'))` call. Keeping the
// predicate itself outside the redesign directory means that static,
// eager import never creates a module-graph edge into the redesign
// directory — the ONLY way to reach `src/redesign/admin/**` from the
// always-loaded entry file is the single dynamic `import()` used by
// `lazy(...)`.
//
// The flag value itself contains no secret, credential, or allowlisted
// identity value (spec §8e(ii)) — it is a plain boolean-ish string, the
// same kind of value already used by the three prior phases.
export function isAdminRedesignEnabled() {
  const allowedMode = import.meta.env.DEV === true || import.meta.env.MODE === 'preview';
  return allowedMode && import.meta.env.VITE_REDESIGN_ENABLED === 'true';
}
