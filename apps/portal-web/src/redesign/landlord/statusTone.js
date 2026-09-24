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
