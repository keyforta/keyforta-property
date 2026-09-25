import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors apps/portal-web/test/redesign/manager-redesign-mount.test.jsx
// and tenant-redesign-mount.test.jsx's coverage, scoped to the single new
// mount point inside `OnboardingAdmin()`
// (docs/product/ADMIN_REDESIGN_SPEC.md §1/§9). Unlike those Portal-web
// suites, there is no `?role=`-style session/localStorage seeding here —
// Admin authenticates via mocked `@keyforta/browser-auth`, exactly as
// `test/OnboardingAdmin.test.jsx` already does.
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

import { OnboardingAdmin } from '../../src/OnboardingAdmin.jsx';
import i18n from '../../src/i18n.js';

function renderAdmin() {
  return render(<FluentProvider theme={webLightTheme}><OnboardingAdmin /></FluentProvider>);
}

describe('Admin redesign flag gating (single mount point in OnboardingAdmin())', () => {
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

  it('renders the existing unstyled admin shell when VITE_REDESIGN_ENABLED is unset (default off)', async () => {
    const { container } = renderAdmin();
    expect(await screen.findByText('No onboarding applications are awaiting review.')).toBeInTheDocument();
    expect(container.querySelector('.kf-admin-redesign')).not.toBeInTheDocument();
  });

  it('renders the existing unstyled admin shell when VITE_REDESIGN_ENABLED is explicitly "false"', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'false');
    const { container } = renderAdmin();
    expect(await screen.findByText('No onboarding applications are awaiting review.')).toBeInTheDocument();
    expect(container.querySelector('.kf-admin-redesign')).not.toBeInTheDocument();
  });

  it('renders the flag-gated redesigned admin shell when VITE_REDESIGN_ENABLED is "true"', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    const { container } = renderAdmin();
    await waitFor(() => expect(container.querySelector('.kf-admin-redesign')).toBeInTheDocument());
    expect(await screen.findByText('No onboarding applications are awaiting review.')).toBeInTheDocument();
  });

  it('never renders the redesigned shell for a signed-out session even when the flag is on', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    mocks.authState.current = { status: 'signed-out' };
    const { container } = renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Landlord onboarding review' })).toBeInTheDocument();
    expect(container.querySelector('.kf-admin-redesign')).not.toBeInTheDocument();
  });

  it('flag on: switches between the onboarding and media-review sections using the same section state', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    mocks.mediaReviewListMock.mockResolvedValue([]);
    const { container } = renderAdmin();
    await waitFor(() => expect(container.querySelector('.kf-admin-redesign')).toBeInTheDocument());
    await screen.findByText('No onboarding applications are awaiting review.');

    fireEvent.click(screen.getByRole('button', { name: 'Media review' }));

    expect(await screen.findByText('No public listings are awaiting media review.')).toBeInTheDocument();
    expect(container.querySelector('.kf-admin-redesign')).toBeInTheDocument();
  });

  it('flag on: the same onboardingApi/mediaReviewApi/adminAuth hooks are used (no duplicate data fetch)', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    renderAdmin();
    await waitFor(() => expect(mocks.listMock).toHaveBeenCalledTimes(1));
    expect(mocks.mediaReviewListMock).not.toHaveBeenCalled();
  });
});
