import { describe, expect, it } from 'vitest';
import { annotateStatusTone } from '../../src/redesign/landlord/statusTone.js';

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
