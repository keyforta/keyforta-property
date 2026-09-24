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

  toggleButtons[0].click();
  return true;
}
