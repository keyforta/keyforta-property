// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { HealthWidget, type HealthWidgetState } from '../src/HealthWidget.js';

const states: readonly HealthWidgetState[] = [
  { kind: 'loading' },
  { kind: 'empty' },
  { checkedAt: '2026-09-16T02:00:00Z', kind: 'populated' },
  { correlationId: 'corr-synthetic-001', kind: 'error' },
];

describe('health widget states', () => {
  it.each(states)('renders $kind with an accessible status surface', async (state) => {
    const { container } = render(<HealthWidget state={state} />);
    expect(screen.getByRole('heading', { name: 'KEYFORTA service status' })).toBeVisible();
    expect(screen.getByRole(state.kind === 'error' ? 'alert' : 'status')).toBeVisible();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('uses the French table and falls back to English deterministically', () => {
    const { rerender } = render(<HealthWidget locale="fr-CA" state={{ kind: 'empty' }} />);
    expect(screen.getByRole('heading', { name: 'Etat du service KEYFORTA' })).toBeVisible();
    rerender(<HealthWidget locale="de-DE" state={{ kind: 'empty' }} />);
    expect(screen.getByRole('heading', { name: 'KEYFORTA service status' })).toBeVisible();
  });

  it('does not expose raw exception details in the error state', () => {
    render(<HealthWidget state={{ correlationId: 'corr-synthetic-001', kind: 'error' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.queryByText(/stack|token|exception/i)).not.toBeInTheDocument();
  });
});