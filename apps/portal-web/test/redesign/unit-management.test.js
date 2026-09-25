import { describe, expect, it, vi } from 'vitest';
import { openSoleUnitManagementControl } from '../../src/redesign/landlord/unitManagement.js';

// Copilot PR #134 review, cycle-3/4 finding #3: clicking "Set pricing &
// availability" must (per spec §10.2) open the existing "Manage this
// unit" toggle when exactly one property/unit exists — not just scroll.
describe('openSoleUnitManagementControl', () => {
  function containerWithToggle(label = 'Set pricing & availability') {
    const container = document.createElement('div');
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = vi.fn();
    container.appendChild(button);
    return { container, button };
  }

  it('clicks the sole "Manage this unit" toggle button when exactly one property with exactly one unit exists', () => {
    const { container, button } = containerWithToggle();
    const clickSpy = vi.spyOn(button, 'click');
    const properties = [{ id: 'p1', units: [{ id: 'u1' }] }];
    const result = openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  // PO feedback ("set pricing & availability can just be an appropriate
  // icon"): the real toggle button is icon-only now, so it has no
  // visible `textContent` — only an `aria-label` — and this must still
  // be found and clicked the same way.
  it('clicks the sole toggle button by its aria-label when it has no visible text (icon-only button)', () => {
    const container = document.createElement('div');
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Set pricing & availability');
    const clickSpy = vi.spyOn(button, 'click');
    container.appendChild(button);
    const properties = [{ id: 'p1', units: [{ id: 'u1' }] }];
    const result = openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is more than one property', () => {
    const { container, button } = containerWithToggle();
    const clickSpy = vi.spyOn(button, 'click');
    const properties = [{ id: 'p1', units: [{ id: 'u1' }] }, { id: 'p2', units: [{ id: 'u2' }] }];
    const result = openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
    expect(result).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the sole property has more than one unit', () => {
    const { container, button } = containerWithToggle();
    const clickSpy = vi.spyOn(button, 'click');
    const properties = [{ id: 'p1', units: [{ id: 'u1' }, { id: 'u2' }] }];
    const result = openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
    expect(result).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the sole property has zero units', () => {
    const { container, button } = containerWithToggle();
    const clickSpy = vi.spyOn(button, 'click');
    const properties = [{ id: 'p1', units: [] }];
    const result = openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
    expect(result).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('does nothing when no matching toggle button is found in the DOM (e.g. the unit\'s form is already open)', () => {
    const container = document.createElement('div');
    const properties = [{ id: 'p1', units: [{ id: 'u1' }] }];
    const result = openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
    expect(result).toBe(false);
  });

  it('does nothing when more than one matching toggle button is found (ambiguous, defensive)', () => {
    const container = document.createElement('div');
    const button1 = document.createElement('button');
    button1.textContent = 'Set pricing & availability';
    const button2 = document.createElement('button');
    button2.textContent = 'Set pricing & availability';
    container.append(button1, button2);
    const properties = [{ id: 'p1', units: [{ id: 'u1' }] }];
    const result = openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
    expect(result).toBe(false);
  });

  it('is a no-op when the container or label is missing (defensive)', () => {
    expect(openSoleUnitManagementControl(null, [{ id: 'p1', units: [{ id: 'u1' }] }], 'label')).toBe(false);
    const container = document.createElement('div');
    expect(openSoleUnitManagementControl(container, [{ id: 'p1', units: [{ id: 'u1' }] }], '')).toBe(false);
  });

  // Copilot PR #134 review, cycle-4 finding #2 (comment 4099022268, re-
  // opened): the real toggle button (property-management-panel.jsx,
  // protected) renders `disabled` until that panel's own token-resolution
  // effect reaches `tokenStatus === 'ready'`; native browsers never invoke
  // a disabled <button>'s activation behavior even for a programmatic
  // `.click()`, so the earlier fix's synchronous-only `.click()` call was
  // a silent no-op whenever the checklist row was clicked before that
  // async token resolution completed — exactly the kind of "click
  // simulation doesn't set up correctly"/"click handler never actually
  // fires" gap the reviewer described, and one the earlier unit tests
  // (which only ever used a plain, never-disabled `<button>`) could not
  // have caught.
  describe('when the sole matching toggle button starts out disabled', () => {
    function containerWithDisabledToggle(label = 'Set pricing & availability') {
      const container = document.createElement('div');
      const button = document.createElement('button');
      button.textContent = label;
      button.disabled = true;
      container.appendChild(button);
      return { container, button };
    }

    it('does not click immediately, but schedules a click and fires it once the button becomes enabled', () => {
      const { container, button } = containerWithDisabledToggle();
      const clickSpy = vi.spyOn(button, 'click');
      const properties = [{ id: 'p1', units: [{ id: 'u1' }] }];

      const result = openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
      expect(result).toBe(true);
      expect(clickSpy).not.toHaveBeenCalled();

      button.disabled = false;
      // Real MutationObserver callbacks fire as a microtask; flushing one
      // microtask turn is enough for jsdom's implementation.
      return Promise.resolve().then(() => {
        expect(clickSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('never clicks if the button stays disabled forever (e.g. a demo session that can never reach "ready")', async () => {
      vi.useFakeTimers();
      try {
        const { container, button } = containerWithDisabledToggle();
        const clickSpy = vi.spyOn(button, 'click');
        const properties = [{ id: 'p1', units: [{ id: 'u1' }] }];

        openSoleUnitManagementControl(container, properties, 'Set pricing & availability');
        await vi.advanceTimersByTimeAsync(10_000);
        expect(clickSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
