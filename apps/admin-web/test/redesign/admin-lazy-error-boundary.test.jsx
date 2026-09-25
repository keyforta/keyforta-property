import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Copilot review lesson from the Manager/Tenant phases (PR #137/#138):
// new lazy-loaded chunk/error-boundary wiring needs its own dedicated
// regression test, not just implicit coverage from the happy-path mount
// test. Mirrors
// apps/portal-web/test/redesign/tenant-lazy-error-boundary.test.jsx's
// structure/assertions exactly, scoped to Admin's own
// `AdminRedesignErrorBoundary`/`AdminRedesignLoading` wiring inside
// `OnboardingAdmin()` (docs/product/ADMIN_REDESIGN_SPEC.md §9).
const mocks = vi.hoisted(() => ({
  authState: { current: { status: 'signed-out' } },
  listMock: vi.fn(),
  decideMock: vi.fn(),
  mediaReviewListMock: vi.fn(),
  mediaReviewDecideMock: vi.fn(),
  getReviewImageContentMock: vi.fn(),
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
  initializeMock: vi.fn(),
}));

vi.mock('@keyforta/browser-auth', () => ({
  createBrowserEntraAuth: () => ({
    subscribe: (cb) => { cb(); return () => {}; },
    getSnapshot: () => mocks.authState.current,
    initialize: mocks.initializeMock,
    signIn: mocks.signInMock,
    signOut: mocks.signOutMock,
    getAccessToken: vi.fn(),
  }),
}));

vi.mock('../../src/onboarding-api.js', () => ({
  createOnboardingApi: () => ({
    list: mocks.listMock,
    decide: mocks.decideMock,
  }),
  resolveAdminApiBaseUrl: () => 'https://admin-api.test',
}));

vi.mock('../../src/media-review-api.js', () => ({
  createMediaReviewApi: () => ({
    list: mocks.mediaReviewListMock,
    decide: mocks.mediaReviewDecideMock,
    getReviewImageContent: mocks.getReviewImageContentMock,
  }),
}));

// Simulates a transient chunk/network failure: the dynamic import behind
// `React.lazy(...)` for the Admin redesign in `OnboardingAdmin.jsx`
// rejects instead of resolving.
vi.mock('../../src/redesign/admin/index.jsx', () => {
  throw new Error('Simulated chunk load failure (network/CDN blip)');
});

import { OnboardingAdmin } from '../../src/OnboardingAdmin.jsx';
import i18n from '../../src/i18n.js';

function renderAdmin() {
  return render(<FluentProvider theme={webLightTheme}><OnboardingAdmin /></FluentProvider>);
}

describe('Admin redesign lazy-load loading state and error fallback', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.authState.current = { status: 'signed-in', account: { name: 'Admin User', username: 'admin@test.keyforta.com' } };
    mocks.listMock.mockReset();
    mocks.decideMock.mockReset();
    mocks.mediaReviewListMock.mockReset();
    mocks.mediaReviewDecideMock.mockReset();
    mocks.getReviewImageContentMock.mockReset();
    mocks.signInMock.mockReset();
    mocks.signOutMock.mockReset();
    mocks.initializeMock.mockReset();
    mocks.listMock.mockResolvedValue([]);
    mocks.mediaReviewListMock.mockResolvedValue([]);
    i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it('renders a visible loading state first, then falls back to the existing legacy admin shell (not a blank screen) when the lazy chunk import rejects, and logs the failure', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderAdmin();

    // (a) A real, visible loading state — not a blank/null render — while
    // the (here, doomed-to-reject) dynamic import is in flight.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.textContent.trim().length).toBeGreaterThan(0);

    // (b) Once the rejection propagates, the legacy admin shell (the same
    // shell rendered when the flag is off) must render — never a blank
    // screen — and the redesign's scoping class must be absent.
    await waitFor(() => {
      expect(screen.getByText('No onboarding applications are awaiting review.')).toBeInTheDocument();
    });
    expect(container.querySelector('.kf-admin-redesign')).not.toBeInTheDocument();
    // The rest of the legacy shell (nav, sign-out) is present and usable,
    // confirming this isn't a partial/degraded render.
    expect(screen.getByRole('button', { name: /Sign out/i })).toBeInTheDocument();

    // (c) The failure must be logged for diagnosability, not swallowed.
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
