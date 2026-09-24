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
});
