// Copilot PR #137 review: a `draft` listing row inherited the base
// `.status` span's flat green "positive" background from the shared,
// protected `listing-publication-panel.jsx` (`styles.css` gives every
// `.status` value the same color unless something outside that file
// overrides it), rendering identically to a genuinely `published` row.
//
// The Manager spec's acceptance boundary (§9) limits changes to
// already-shipped files outside `redesign/manager/` to the single portal
// mount-point change; it does not authorize extending the shared,
// already-approved Landlord Phase 1 helper (`../landlord/statusTone.js`)
// for a Manager-only need. So this is a small, Manager-local sibling of
// that same technique instead of a shared-file change: it walks the
// already-rendered `.status` spans inside the wrapper this shell already
// owns and annotates the one additional "neutral" tone Manager's row set
// needs (`draft`), purely by comparing already-rendered text against the
// one known neutral status string — no domain rule is reimplemented,
// and it never touches `negative`, which the shared, unmodified Landlord
// helper (`annotateStatusTone`, called separately by this same shell)
// already owns for the `withdrawn` row.
export function annotateNeutralStatusTone(container, neutralTexts) {
  if (!container || !neutralTexts) return;
  container.querySelectorAll('.status').forEach((element) => {
    const text = element.textContent.trim();
    if (neutralTexts.has(text)) {
      element.setAttribute('data-kf-tone', 'neutral');
    } else if (element.getAttribute('data-kf-tone') === 'neutral') {
      element.removeAttribute('data-kf-tone');
    }
  });
}
