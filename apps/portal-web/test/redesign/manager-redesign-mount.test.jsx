import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@keyforta/ui', () => ({
  AppBrand: ({ surface }) => <div>{surface} brand</div>,
  MetricCard: ({ label, value, note }) => <div><strong>{label}</strong><span>{value}</span><small>{note}</small></div>,
}));

const mocks = vi.hoisted(() => ({
  authState: { current: { status: 'signed-out' } },
}));

vi.mock('@keyforta/browser-auth', () => ({
  createBrowserEntraAuth: () => ({
    subscribe: (cb) => { cb(); return () => {}; },
    getSnapshot: () => mocks.authState.current,
    initialize: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    getAccessToken: vi.fn(async () => 'entra-access-token'),
    getAccessTokenSilent: vi.fn(async () => null),
  }),
}));

const membershipListMock = vi.hoisted(() => vi.fn());
const publicListingGetMock = vi.hoisted(() => vi.fn());
const rentalPropertiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('@keyforta/api-client', () => ({
  createApiClient: () => ({
    list: membershipListMock,
    get: (resource, id) => (resource === 'properties' ? rentalPropertiesGetMock(resource, id) : publicListingGetMock(resource, id)),
  }),
}));

import { Portal } from '../../src/portal-app.jsx';
import i18n from '../../src/i18n.js';

function renderPortal() {
  return render(<FluentProvider theme={webLightTheme}><Portal /></FluentProvider>);
}

function seedManagerSession() {
  localStorage.setItem('keyforta.portal.session', JSON.stringify({
    email: 'demo.manager@test.keyforta.com',
    role: 'manager',
    issuedAt: '2026-09-24T00:00:00.000Z',
    organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  }));
}

// Mirrors test/redesign/lazy-boundary.test.js's Landlord coverage, scoped
// to the new Manager mount point in portal-app.jsx
// (docs/product/MANAGER_REDESIGN_SPEC.md).
describe('Manager redesign flag gating (single mount point in portal-app.jsx)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.unstubAllEnvs();
    mocks.authState.current = { status: 'signed-out' };
    membershipListMock.mockReset();
    membershipListMock.mockResolvedValue({ data: [], meta: { requestId: 'req-1' } });
    publicListingGetMock.mockReset();
    publicListingGetMock.mockResolvedValue({ items: [], meta: { requestId: 'req-listings-1' } });
    rentalPropertiesGetMock.mockReset();
    rentalPropertiesGetMock.mockResolvedValue({ items: [], meta: { requestId: 'req-properties-1' } });
    i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it('renders the existing unstyled manager shell when VITE_REDESIGN_ENABLED is unset (default off)', async () => {
    seedManagerSession();
    const { container } = renderPortal();
    expect(await screen.findByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeInTheDocument();
    expect(container.querySelector('.kf-manager-redesign')).not.toBeInTheDocument();
  });

  it('renders the existing unstyled manager shell when VITE_REDESIGN_ENABLED is explicitly "false"', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'false');
    seedManagerSession();
    const { container } = renderPortal();
    expect(await screen.findByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeInTheDocument();
    expect(container.querySelector('.kf-manager-redesign')).not.toBeInTheDocument();
  });

  it('renders the flag-gated redesigned manager shell when VITE_REDESIGN_ENABLED is "true"', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    seedManagerSession();
    const { container } = renderPortal();
    await waitFor(() => expect(container.querySelector('.kf-manager-redesign')).toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeInTheDocument();
    // Same reused panel, same reused copy — only the shell chrome differs.
    expect(screen.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toBeInTheDocument();
    // No next-best-action checklist card for Manager (§8.1(c) — omitted).
    expect(screen.queryByTestId('next-best-action-checklist')).not.toBeInTheDocument();
  });

  it('never renders a "Add a property" heading for Manager (PropertyManagementPanel is never mounted for this role)', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    seedManagerSession();
    renderPortal();
    await screen.findByRole('heading', { name: 'Publish or withdraw assigned listings' });
    expect(screen.queryByRole('heading', { name: 'Add a property' })).not.toBeInTheDocument();
  });

  it('shows the status legend on the Portfolio tab but not on Overview', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    seedManagerSession();
    renderPortal();
    await screen.findByRole('heading', { name: 'Publish or withdraw assigned listings' });
    expect(screen.queryByTestId('portfolio-status-legend')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Portfolio' }));
    expect(await screen.findByTestId('portfolio-status-legend')).toBeInTheDocument();
  });

  it('does not gate non-manager roles into the manager redesign even when the flag is on', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'tenant@test.keyforta.com', role: 'tenant', issuedAt: '2026-09-24T00:00:00.000Z', organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }));
    const { container } = renderPortal();
    expect(await screen.findByRole('heading', { name: 'Everything about your home, in one place.' })).toBeInTheDocument();
    expect(container.querySelector('.kf-manager-redesign')).not.toBeInTheDocument();
  });
});
