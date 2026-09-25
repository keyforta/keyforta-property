import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Copilot PR #134 review, cycle-6 finding (High): "When the flag is on,
// this branch renders `null` until the lazy chunk resolves, and a
// rejected dynamic import has no error boundary. A transient
// chunk/network failure therefore leaves the landlord portal blank with
// no retry or legacy fallback." This suite asserts the fix: (1) a
// visible, real loading state renders while the chunk is in flight, and
// (2) if the dynamic import of `./redesign/landlord/index.jsx` rejects,
// the existing (unmodified) legacy landlord shell renders instead of a
// blank screen, and the failure is logged (not swallowed).
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

// Simulates a transient chunk/network failure: the dynamic import behind
// `React.lazy(...)` in portal-app.jsx rejects instead of resolving.
vi.mock('../../src/redesign/landlord/index.jsx', () => {
  throw new Error('Simulated chunk load failure (network/CDN blip)');
});

import { Portal } from '../../src/portal-app.jsx';
import i18n from '../../src/i18n.js';

function renderPortal() {
  return render(<FluentProvider theme={webLightTheme}><Portal /></FluentProvider>);
}

function seedLandlordSession() {
  localStorage.setItem('keyforta.portal.session', JSON.stringify({
    email: 'demo.landlord@test.keyforta.com',
    role: 'landlord',
    issuedAt: '2026-09-18T00:00:00.000Z',
    organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  }));
}

describe('Landlord redesign lazy-load loading state and error fallback', () => {
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

  it('renders a visible loading state first, then falls back to the existing legacy landlord shell (not a blank screen) when the lazy chunk import rejects, and logs the failure', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    seedLandlordSession();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderPortal();

    // (a) A real, visible loading state — not a blank/null render — while
    // the (here, doomed-to-reject) dynamic import is in flight.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.textContent.trim().length).toBeGreaterThan(0);

    // (b) Once the rejection propagates, the legacy landlord shell (the
    // same shell rendered when the flag is off) must render — never a
    // blank screen — and the redesign's scoping class must be absent.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'A clear view of your property portfolio.' })).toBeInTheDocument();
    });
    expect(container.querySelector('.kf-landlord-redesign')).not.toBeInTheDocument();
    // The rest of the legacy shell (sidebar nav, quick actions) is present
    // and usable, confirming this isn't a partial/degraded render.
    expect(screen.getByRole('button', { name: /Sign out/i })).toBeInTheDocument();

    // (c) The failure must be logged for diagnosability, not swallowed.
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
