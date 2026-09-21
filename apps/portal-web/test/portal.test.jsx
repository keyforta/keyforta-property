import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@keyforta/ui', () => ({
  AppBrand: ({ surface }) => <div>{surface} brand</div>,
  MetricCard: ({ label, value, note }) => <div><strong>{label}</strong><span>{value}</span><small>{note}</small></div>,
}));

const mocks = vi.hoisted(() => ({
  authState: { current: { status: 'signed-out' } },
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
  initializeMock: vi.fn(),
  getAccessTokenMock: vi.fn(async () => 'entra-access-token'),
}));

vi.mock('@keyforta/browser-auth', () => ({
  createBrowserEntraAuth: () => ({
    subscribe: (cb) => { cb(); return () => {}; },
    getSnapshot: () => mocks.authState.current,
    initialize: mocks.initializeMock,
    signIn: mocks.signInMock,
    signOut: mocks.signOutMock,
    getAccessToken: mocks.getAccessTokenMock,
  }),
}));

const membershipListMock = vi.hoisted(() => vi.fn());
const publicListingGetMock = vi.hoisted(() => vi.fn());
vi.mock('@keyforta/api-client', () => ({
  createApiClient: () => ({ list: membershipListMock, get: publicListingGetMock }),
}));

import { Portal } from '../src/portal-app.jsx';
import i18n from '../src/i18n.js';

function renderPortal() {
  return render(<FluentProvider theme={webLightTheme}><Portal /></FluentProvider>);
}

describe('Portal', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.useRealTimers();
    mocks.authState.current = { status: 'signed-out' };
    mocks.signInMock.mockClear();
    mocks.signOutMock.mockClear();
    mocks.initializeMock.mockClear();
    mocks.getAccessTokenMock.mockClear();
    membershipListMock.mockReset();
    membershipListMock.mockResolvedValue({ data: [], meta: { requestId: 'req-1' } });
    publicListingGetMock.mockReset();
    publicListingGetMock.mockResolvedValue({ items: [], meta: { requestId: 'req-listings-1' } });
    i18n.changeLanguage('en');
  });

  it('renders the Microsoft Entra sign-in gate when no session exists', () => {
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Sign in to continue.' })).toBeInTheDocument();
    const signInButton = screen.getByRole('button', { name: 'Sign in with Microsoft Entra' });
    fireEvent.click(signInButton);
    expect(mocks.signInMock).toHaveBeenCalledTimes(1);
  });

  it('shows an honest workspace-access-pending state for a signed-in identity with no assigned role', () => {
    mocks.authState.current = { status: 'signed-in', account: { name: 'Amina K.', username: 'amina@example.com' } };
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Workspace access pending.' })).toBeInTheDocument();
    expect(screen.getByText(/Signed in as Amina K\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.signOutMock).toHaveBeenCalledTimes(1);
  });

  it('restores a legacy technician session as operator access', () => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'tech@test.keyforta.com', role: 'technician', issuedAt: '2026-09-18T00:00:00.000Z' }));
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Move every assigned job forward.' })).toBeInTheDocument();
    expect(screen.getByText('tech@test.keyforta.com')).toBeInTheDocument();
  });


  it('falls back to tenant actions when a persisted session role is stale', () => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'stale@test.keyforta.com', role: 'archived-role', issuedAt: '2026-09-18T00:00:00.000Z' }));
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Everything about your home, in one place.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /U Upload a document/ })).toBeInTheDocument();
  });

  it('accepts a role from the query string and clears it from the URL', () => {
    window.history.replaceState({}, '', '/?role=manager&email=manager@example.com');
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeInTheDocument();
    expect(screen.getByText('manager@example.com')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it.each([
    ['tenant', 'once the tenant read APIs are available'],
    ['landlord', 'once the landlord read APIs are available'],
    ['manager', 'once the manager read APIs are available'],
    ['operator', 'once the operator read APIs are available'],
  ])('shows honest empty states instead of fabricated stats/activity for the %s role', (role, expectedCopy) => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: `demo.${role}@test.keyforta.com`, role, issuedAt: '2026-09-18T00:00:00.000Z' }));
    renderPortal();
    const statsSection = screen.getByTestId('stats-empty-state').parentElement;
    const activityPanel = screen.getByTestId('rows-empty-state').parentElement;
    expect(screen.getByTestId('stats-empty-state')).toHaveTextContent(expectedCopy);
    expect(screen.getByTestId('rows-empty-state')).toHaveTextContent(expectedCopy);
    expect(statsSection?.children).toHaveLength(1);
    expect(activityPanel?.children).toHaveLength(2);
    expect(activityPanel?.querySelectorAll('.record-row')).toHaveLength(0);
  });

  it('resets to the sign-in screen after sign out', () => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'demo.landlord@test.keyforta.com', role: 'landlord', issuedAt: '2026-09-18T00:00:00.000Z' }));
    renderPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('heading', { name: 'Sign in to continue.' })).toBeInTheDocument();
  });


  it('shows the listing publication panel only for manager overview and portfolio views', () => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'manager@test.keyforta.com', role: 'manager', issuedAt: '2026-09-18T00:00:00.000Z', organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }));
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Applications' }));
    expect(screen.queryByRole('heading', { name: 'Publish or withdraw assigned listings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Portfolio' }));
    expect(screen.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toBeInTheDocument();
    expect(screen.getByText(/No assigned listings are loaded in this prototype yet/i)).toBeInTheDocument();
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
    expect((await axe(container)).violations).toEqual([]);
  });

  it('switches the workspace to French when the language toggle is used', () => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'demo.tenant@test.keyforta.com', role: 'tenant', issuedAt: '2026-09-18T00:00:00.000Z' }));
    renderPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to French' }));
    expect(screen.getByRole('heading', { name: 'Tout ce qui concerne votre logement, au même endroit.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();
  });

  it('fetches the authoritative listing portfolio feed for a manager with a real access token (issue #114)', async () => {
    mocks.authState.current = { status: 'signed-in', account: { name: 'Priya S.', username: 'priya@example.com', email: 'priya@example.com' } };
    membershipListMock.mockResolvedValue({
      data: [{ organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', role: 'manager' }],
      meta: { requestId: 'req-manager-membership' },
    });
    publicListingGetMock.mockResolvedValue({
      items: [{ id: '6d5f0d4f-e7ca-4c96-b67b-513f871f3f1a', title: 'Riverside apartment · Unit 2A', status: 'withdrawn', note: 'Ready to publish.' }],
      meta: { requestId: 'req-listings-2' },
    });

    renderPortal();

    await waitFor(() => expect(publicListingGetMock).toHaveBeenCalledWith('public-listings', 'mine'));
    expect(await screen.findByText('Riverside apartment · Unit 2A')).toBeInTheDocument();
    expect(screen.queryByText(/No assigned listings are loaded in this prototype yet/i)).not.toBeInTheDocument();
  });

  it('does not fetch the listing portfolio feed for a demo session', () => {
    window.history.replaceState({}, '', '/?role=manager&email=manager@example.com');
    renderPortal();
    expect(screen.getByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeInTheDocument();
    expect(publicListingGetMock).not.toHaveBeenCalled();
  });

  it('keeps the listing publication panel tied to the Portfolio section after switching language', () => {
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'manager@test.keyforta.com', role: 'manager', issuedAt: '2026-09-18T00:00:00.000Z', organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }));
    renderPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to French' }));
    fireEvent.click(screen.getByRole('button', { name: 'Portefeuille' }));
    expect(screen.getByRole('heading', { name: 'Publier ou retirer les annonces attribuées' })).toBeInTheDocument();
  });

  it('resolves a real Entra sign-in with a membership into a real (non-demo) workspace session', async () => {
    mocks.authState.current = { status: 'signed-in', account: { name: 'Marie L.', username: 'marie@example.com', email: 'marie@example.com' } };
    membershipListMock.mockResolvedValue({
      data: [{ organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', role: 'manager' }],
      meta: { requestId: 'req-2' },
    });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeInTheDocument();
    });
    expect(screen.getByText('marie@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Workspace access pending.' })).not.toBeInTheDocument();
    expect(membershipListMock).toHaveBeenCalledWith('session/memberships');

    expect(screen.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => {
      expect(mocks.getAccessTokenMock).toHaveBeenCalled();
    });
  });

  it('keeps showing the pending-access state for a signed-in identity with an empty membership lookup', async () => {
    mocks.authState.current = { status: 'signed-in', account: { name: 'Amina K.', username: 'amina@example.com' } };
    membershipListMock.mockResolvedValue({ data: [], meta: { requestId: 'req-3' } });
    renderPortal();

    await waitFor(() => {
      expect(membershipListMock).toHaveBeenCalled();
    });
    expect(screen.getByRole('heading', { name: 'Workspace access pending.' })).toBeInTheDocument();
  });
});
