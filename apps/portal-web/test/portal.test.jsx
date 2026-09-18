import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@keyforta/ui', () => ({
  AppBrand: ({ surface }) => <div>{surface} brand</div>,
  MetricCard: ({ label, value, note }) => <div><strong>{label}</strong><span>{value}</span><small>{note}</small></div>,
}));

import { Portal } from '../src/portal-app.jsx';

function renderPortal() {
  return render(<FluentProvider theme={webLightTheme}><Portal /></FluentProvider>);
}

describe('Portal', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.useRealTimers();
  });

  it('renders the signed-out choice screen when no session exists', () => {
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Sign in to continue.' })).toBeInTheDocument();
    expect(screen.getByText('Choose the workspace that matches your role.')).toBeInTheDocument();
  });

  it('restores a legacy technician session as operator access', () => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'tech@test.keyforta.com', role: 'technician', issuedAt: '2026-09-18T00:00:00.000Z' }));
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Move every assigned job forward.' })).toBeInTheDocument();
    expect(screen.getByText('tech@test.keyforta.com')).toBeInTheDocument();
  });

  it('accepts a role from the query string and clears it from the URL', () => {
    window.history.replaceState({}, '', '/?role=manager&email=manager@example.com');
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeInTheDocument();
    expect(screen.getByText('manager@example.com')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('navigates activity destinations and resets after sign out', () => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'demo.landlord@test.keyforta.com', role: 'landlord', issuedAt: '2026-09-18T00:00:00.000Z' }));
    renderPortal();
    fireEvent.click(screen.getByRole('button', { name: /Riverside apartment · Amina K\./ }));
    expect(screen.getByRole('heading', { name: 'Applications' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('heading', { name: 'Sign in to continue.' })).toBeInTheDocument();
  });

  it('shows a saved acknowledgement for quick actions', () => {
    vi.useFakeTimers();
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'demo.tenant@test.keyforta.com', role: 'tenant', issuedAt: '2026-09-18T00:00:00.000Z' }));
    renderPortal();
    fireEvent.click(screen.getByRole('button', { name: /U Upload a document/ }));
    expect(screen.getByRole('button', { name: /U Saved/ })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('button', { name: /U Upload a document/ })).toBeInTheDocument();
  });

  it('has no critical accessibility violations for the sign-in view', async () => {
    const { container } = renderPortal();
    expect((await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  });
});
