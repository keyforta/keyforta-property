// Copilot PR #134 review finding #2: withdrawn listings (and unavailable
// units) still render with the same flat green "positive" `.status`
// badge color as published/available ones, because the reused, protected
// `.status` markup in property-management-panel.jsx carries no
// status-specific class or data attribute — it's a plain
// `<span className='status'>{translatedText}</span>` for every value.
//
// Since that file cannot be modified (hard constraint) and no new class
// or data attribute can be added to its markup, the tone has to be
// derived from OUTSIDE it: this module walks the already-rendered DOM
// inside the wrapper `<div>` this shell already owns around
// PropertyManagementPanel, and annotates each `.status` badge with a
// `data-kf-tone` attribute purely by comparing its rendered text against
// the small, known set of "negative" translated strings (the exact same
// i18n keys/values already used to render that very text — this is a
// presentational read of already-rendered output, not a reimplementation
// of any domain/business rule about what a listing/unit status means).
//
// This never touches className, event handlers, or any other attribute
// on the element — only the one custom `data-kf-tone` attribute this
// module owns exclusively — so it cannot interfere with
// PropertyManagementPanel's own behavior.
export function annotateStatusTone(container, negativeTexts) {
  if (!container || !negativeTexts) return;
  container.querySelectorAll('.status').forEach((element) => {
    const text = element.textContent.trim();
    if (negativeTexts.has(text)) {
      element.setAttribute('data-kf-tone', 'negative');
    } else if (element.hasAttribute('data-kf-tone')) {
      element.removeAttribute('data-kf-tone');
    }
  });
}

// Copilot PR #134 review, cycle-3/4 finding #6: the "Unit status" /
// "Listing status" distinguishing captions (see redesign.css's "Regression
// fix" comment block) were exposed ONLY via CSS `::before` generated
// content — real, but not reliably exposed to assistive technology (no
// accessible name, no structural relationship), and not something this
// external stylesheet can fix on its own since the underlying `.status`
// spans/`.public-listing-status` wrapper are rendered by the reused,
// protected `property-management-panel.jsx` (this shell cannot add new
// child DOM nodes there without risking React reconciliation conflicts
// over nodes it does not own).
//
// Fixed the same safe way `annotateStatusTone` above already handles this
// exact constraint: annotate the already-rendered, already-owned-by-React
// elements from OUTSIDE with real ARIA attributes (never new child nodes),
// so a screen reader gets the same "Unit status: Available" / "Listing
// status" grouping distinction sighted users see from the CSS captions,
// which remain purely decorative/visual (CSS `content` is not depended on
// for accessibility any more).
export function annotateAccessibleStatusLabels(container, { unitStatusLabel, listingStatusLabel } = {}) {
  if (!container) return;
  if (unitStatusLabel) {
    container.querySelectorAll('.unit-row > .status').forEach((element) => {
      const text = element.textContent.trim();
      element.setAttribute('aria-label', text ? `${unitStatusLabel}: ${text}` : unitStatusLabel);
    });
  }
  if (listingStatusLabel) {
    container.querySelectorAll('.public-listing-status').forEach((element) => {
      element.setAttribute('role', 'group');
      element.setAttribute('aria-label', listingStatusLabel);
    });
  }
}
