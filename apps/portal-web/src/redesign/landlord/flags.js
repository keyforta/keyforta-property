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
export function isLandlordRedesignEnabled() {
  return import.meta.env.VITE_REDESIGN_ENABLED === 'true';
}
