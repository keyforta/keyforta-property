import { describe, expect, it } from 'vitest';
import { annotateAccessibleStatusLabels, annotateStatusTone } from '../../src/redesign/landlord/statusTone.js';

// Copilot PR #134 review finding #2: a withdrawn listing (or unavailable
// unit) must not read visually as "positive" — the reused `.status`
// markup from property-management-panel.jsx (protected, unchanged)
// carries no status-specific class/attribute, so tone has to be derived
// from the already-rendered text and annotated with our own
// `data-kf-tone` attribute for redesign.css to style.
describe('annotateStatusTone', () => {
  it('marks a .status element whose text matches a known negative string with data-kf-tone="negative"', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span class="status">Withdrawn</span>';
    annotateStatusTone(container, new Set(['Withdrawn', 'Unavailable']));
    expect(container.querySelector('.status').getAttribute('data-kf-tone')).toBe('negative');
  });

  it('does not mark a .status element whose text is a positive/neutral value', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span class="status">Available</span>';
    annotateStatusTone(container, new Set(['Withdrawn', 'Unavailable']));
    expect(container.querySelector('.status').hasAttribute('data-kf-tone')).toBe(false);
  });

  it('removes a stale data-kf-tone when the text no longer matches (e.g. after a status change re-render)', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span class="status" data-kf-tone="negative">Available</span>';
    annotateStatusTone(container, new Set(['Withdrawn', 'Unavailable']));
    expect(container.querySelector('.status').hasAttribute('data-kf-tone')).toBe(false);
  });

  it('never touches non-.status elements, even ones with similar text', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span class="listing-meta">Withdrawn</span>';
    annotateStatusTone(container, new Set(['Withdrawn']));
    expect(container.querySelector('.listing-meta').hasAttribute('data-kf-tone')).toBe(false);
  });

  it('is a no-op when container or negativeTexts is missing (defensive)', () => {
    expect(() => annotateStatusTone(null, new Set(['x']))).not.toThrow();
    const container = document.createElement('div');
    expect(() => annotateStatusTone(container, undefined)).not.toThrow();
  });
});

// Copilot PR #134 review, cycle-3/4 finding #6: the "Unit status" /
// "Listing status" captions must be exposed to assistive technology via
// real DOM/ARIA, not only via CSS `::before` generated content (which is
// not reliably exposed to the accessibility tree).
describe('annotateAccessibleStatusLabels', () => {
  it('sets an aria-label combining the unit-status caption and the badge\'s own already-rendered text on .unit-row > .status', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div class="unit-row"><span class="status">Available</span></div>';
    annotateAccessibleStatusLabels(container, { unitStatusLabel: 'Unit status', listingStatusLabel: 'Listing status' });
    expect(container.querySelector('.unit-row > .status').getAttribute('aria-label')).toBe('Unit status: Available');
  });

  // Copilot PR #134 review, comment 4099299657 (cycle-4 finding, tied to
  // 4099022381): "The unit badge is a bare `span`, so adding `aria-label`
  // without a semantic role does not reliably create a nameable
  // accessibility node [...] Give this badge a nameable status role [...]
  // so the promised accessible distinction is exposed to assistive
  // technology." A bare `<span aria-label>` with no role is not
  // guaranteed to be exposed as a nameable node in every accessibility-
  // tree computation (browsers vary on whether a plain, non-interactive,
  // non-landmark `<span>` without a role gets an accessible-name
  // computation at all) — `role="status"` is the semantically-correct
  // choice here (this badge is a small live/dynamic status indicator, the
  // same category ARIA's own `status` role documents), and it reliably
  // makes the element a nameable, aria-live-polite-announced accessible
  // node. This asserts the actual accessible-name RESOLUTION via jest-
  // dom's `toHaveAccessibleName` (not just attribute presence), so a
  // regression that removes the role but keeps the attribute would still
  // be caught if it ever broke name computation.
  it('gives the unit-status badge role="status" IN ADDITION to the aria-label, so it resolves as a real nameable accessible node', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div class="unit-row"><span class="status">Available</span></div>';
    annotateAccessibleStatusLabels(container, { unitStatusLabel: 'Unit status', listingStatusLabel: 'Listing status' });
    const badge = container.querySelector('.unit-row > .status');
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge).toHaveAccessibleName('Unit status: Available');
  });

  it('exposes .public-listing-status as an accessible group named with the listing-status caption', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div class="public-listing-status"><span class="status">Withdrawn</span></div>';
    annotateAccessibleStatusLabels(container, { unitStatusLabel: 'Unit status', listingStatusLabel: 'Listing status' });
    const group = container.querySelector('.public-listing-status');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Listing status');
    // Same rigor as the unit-status badge above: assert the actual
    // accessible-name resolution, not just the attribute's presence.
    expect(group).toHaveAccessibleName('Listing status');
  });

  it('does not touch a .status badge that is not a direct child of .unit-row (e.g. the nested listing-status badge)', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="unit-row">
        <span class="status">Available</span>
        <div class="public-listing-status"><span class="status">Withdrawn</span></div>
      </div>
    `;
    annotateAccessibleStatusLabels(container, { unitStatusLabel: 'Unit status', listingStatusLabel: 'Listing status' });
    const [unitStatus, listingStatus] = container.querySelectorAll('.status');
    expect(unitStatus.getAttribute('aria-label')).toBe('Unit status: Available');
    expect(listingStatus.hasAttribute('aria-label')).toBe(false);
  });

  it('is a no-op when the container is missing (defensive)', () => {
    expect(() => annotateAccessibleStatusLabels(null, { unitStatusLabel: 'Unit status' })).not.toThrow();
  });

  it('is a no-op when no labels are supplied', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div class="unit-row"><span class="status">Available</span></div>';
    annotateAccessibleStatusLabels(container, {});
    expect(container.querySelector('.status').hasAttribute('aria-label')).toBe(false);
    expect(container.querySelector('.status').hasAttribute('role')).toBe(false);
  });
});
