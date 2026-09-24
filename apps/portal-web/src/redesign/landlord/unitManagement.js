// Copilot PR #134 review, cycle-3/4 finding #3: spec §10.2 explicitly
// requires that clicking the "Set pricing & availability" checklist row
// does more than scroll — "if exactly one property/unit exists,
// [it] opens that unit's existing 'Manage this unit' toggle". That toggle
// is `property-management-panel.jsx`'s own `UnitPricingAvailabilityForm`
// closed-state `<Button>` (protected, unmodified file — its `open` state
// is internal/local and not exposed via any prop/ref this shell could
// call directly), so the only way to invoke it without duplicating its
// logic or modifying that file is to locate the already-rendered button
// by its own already-translated text and dispatch a real click on it —
// the exact same "read/act on already-rendered output, never reach into
// internals" pattern already used by `statusTone.js`.
//
// Deliberately conservative: only acts when there is exactly one
// property with exactly one unit (per the spec's explicit condition) AND
// exactly one matching toggle button is found in the DOM — any other
// shape (0 or 2+ properties/units, or an unexpected DOM structure) is a
// no-op here, leaving the scroll (which always still happens) as the only
// effect, rather than guessing which of several units' toggles to open.
export function openSoleUnitManagementControl(container, properties, manageUnitToggleLabel) {
  if (!container || !manageUnitToggleLabel) return false;
  const safeProperties = Array.isArray(properties) ? properties : [];
  if (safeProperties.length !== 1) return false;
  const units = Array.isArray(safeProperties[0]?.units) ? safeProperties[0].units : [];
  if (units.length !== 1) return false;

  const toggleButtons = Array.from(container.querySelectorAll('button')).filter(
    (button) => button.textContent.trim() === manageUnitToggleLabel,
  );
  if (toggleButtons.length !== 1) return false;
  const [toggleButton] = toggleButtons;

  if (!toggleButton.disabled) {
    toggleButton.click();
    return true;
  }

  // Copilot PR #134 review, cycle-4 finding #2 (comment 4099022268, still
  // open after the cycle-3 fix): the real "Manage this unit" toggle
  // (`property-management-panel.jsx`'s `UnitPricingAvailabilityForm`,
  // protected/unmodified) renders `disabled` until that panel's own
  // token-resolution effect reaches `tokenStatus === 'ready'` (see its
  // `disableActions` derivation) — and per the HTML spec, a disabled
  // native <button>'s activation behavior (including its `click` event)
  // is never invoked, even for a programmatic `.click()` call. The
  // cycle-3 fix always called `.click()` synchronously, so for the very
  // common case of a real (non-demo) session whose silent token
  // acquisition is still in flight at the moment the checklist row is
  // clicked, that call was a silent no-op — the user still landed on a
  // collapsed, unopened control, exactly what this finding says must not
  // happen. Rather than bypass that panel's own authorization gating
  // (which would duplicate/override its domain logic — an explicit
  // constraint on this task), this now observes the SAME button for its
  // `disabled` attribute being removed and clicks it the moment that
  // panel's own logic re-enables it, bounded by a timeout so a session
  // that can never reach 'ready' (e.g. a demo session) does not leave a
  // dangling observer running forever.
  return scheduleClickWhenEnabled(toggleButton);
}

const ENABLE_WAIT_TIMEOUT_MS = 5000;

function scheduleClickWhenEnabled(button, timeoutMs = ENABLE_WAIT_TIMEOUT_MS) {
  let settled = false;
  const observer = new MutationObserver(() => {
    if (settled || button.disabled) return;
    settle();
    button.click();
  });
  observer.observe(button, { attributes: true, attributeFilter: ['disabled'] });
  const timeoutId = setTimeout(settle, timeoutMs);

  function settle() {
    if (settled) return;
    settled = true;
    observer.disconnect();
    clearTimeout(timeoutId);
  }

  return true;
}
