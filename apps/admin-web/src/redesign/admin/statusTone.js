// Admin-local status-tone helper (docs/product/ADMIN_REDESIGN_SPEC.md
// §3.2, §5).
//
// Admin has two distinct, non-interchangeable status vocabularies live in
// the same app: the onboarding queue's `pending`/`approved`/`rejected`
// *application* status (all three reachable — a decided application
// remains visible, read-only), and the media-review queue's
// `pending`-only *review* status (a decided review is filtered out of the
// queue entirely by `OnboardingAdmin.jsx`'s `decide()`, so no other value
// is ever rendered). These two `pending` values are not the same concept
// (§0/§5 of the spec) even though they share a string.
//
// This file intentionally does NOT import, extend, or fork the Manager
// phase's own status-tone helper (see spec §1 for its exact path in the
// sibling Portal front-end application) — that file annotates an
// unrelated `draft`/`published`/`withdrawn` *listing* status vocabulary
// inside a different app that `apps/admin-web` cannot import from in any
// case (separate Vite build roots). The only thing carried forward from
// that file is the *pattern* it established (a small, section-local
// helper rather than extending an already-merged, unrelated phase's
// file) — never its logic or its export names.
//
// Unlike the Manager helper (which mutates already-rendered DOM text,
// because it must annotate a shared, protected component it cannot
// otherwise customize), Admin's queue cards are new, Admin-owned JSX, so
// this helper simply maps a known status string to the Fluent `Badge`
// `color` prop directly — no DOM read/mutation is needed or performed.
export function onboardingStatusTone(status) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

// Only `pending` is ever reachable for a media review today (§1/§5 of the
// spec), but this still resolves through the same Fluent semantic-color
// mapping rather than a hardcoded literal, so a future genuinely reachable
// status value fails safe to the existing `warning` tint instead of a
// wrong hardcoded color.
export function mediaReviewStatusTone(status) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}
