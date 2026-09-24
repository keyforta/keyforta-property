// Single source of truth for whether the flag-gated landlord redesign is
// reachable. Read via `import.meta.env` (build-time, Vite-inlined) per the
// task's hard constraint: this must never be settable at runtime and must
// default to off in every environment unless explicitly turned on for a
// development/preview build (see REQUIREMENTS_GAPS.md's "Redesigned
// per-role UI/UX" row, acceptance criterion 6).
//
// Deliberately a plain string comparison against the literal `'true'`
// (never a generic truthiness check) so an accidentally-set empty string,
// `'0'`, or `'false'` value cannot enable the flag.
//
// Copilot PR #134 review finding #1: the env-var check alone is not
// enough — a misconfigured production deploy could leak
// VITE_REDESIGN_ENABLED=true into its build environment. Gate on Vite's
// own DEV/MODE signals as well, so the route is unreachable in a
// production build/mode by construction, independent of the env var's
// value. `import.meta.env.DEV` is Vite's own "not a production build"
// signal (true for `vite`/`vitest`, false for `vite build --mode
// production`); `MODE === 'preview'` additionally allows a deliberate
// `vite build --mode preview` + `vite preview` flow used for reviewing
// this work before it reaches production, matching the acceptance
// criterion that the route be reachable only in development/preview.
//
// Copilot PR #134 review, cycle-4 finding #1 (comment 4099022183): this
// module deliberately does NOT live under `src/redesign/landlord/`. It is
// imported statically (eagerly) by `portal-app.jsx` — every session must
// be able to cheaply evaluate the flag predicate to decide whether to even
// attempt the `lazy(() => import('./redesign/landlord/index.jsx'))` call.
// Keeping the predicate itself outside the redesign directory means that
// static, eager import never creates a module-graph edge into the redesign
// directory, so the ONLY way to reach `src/redesign/landlord/**` from the
// always-loaded entry file is the single dynamic `import()` used by
// `lazy(...)` — the redesign directory therefore stays entirely behind the
// lazy import boundary, regardless of what a given bundler's tree-shaker
// happens to fold away in any one build.
export function isLandlordRedesignEnabled() {
  const allowedMode = import.meta.env.DEV === true || import.meta.env.MODE === 'preview';
  return allowedMode && import.meta.env.VITE_REDESIGN_ENABLED === 'true';
}
