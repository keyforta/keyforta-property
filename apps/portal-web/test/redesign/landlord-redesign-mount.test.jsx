import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

function seedLandlordSession() {
  localStorage.setItem('keyforta.portal.session', JSON.stringify({
    email: 'demo.landlord@test.keyforta.com',
    role: 'landlord',
    issuedAt: '2026-09-18T00:00:00.000Z',
    organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  }));
}

// Acceptance criterion 1 (REQUIREMENTS_GAPS.md, "Redesigned per-role
// UI/UX"): with the flag unset/false, every existing landlord route/page
// must render exactly as today — this is the "flag-off path is
// unaffected" regression guard called for by the task.
describe('Landlord redesign flag gating (single mount point in portal-app.jsx)', () => {
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
    // `vi.stubEnv` mutates a process-wide/module-wide env object; without
    // this, a "flag on" test here could otherwise leak into
    // test/portal.test.jsx's landlord assertions if both run in the same
    // worker (observed regression while writing this suite — see the PR
    // description's red/green evidence).
    vi.unstubAllEnvs();
    cleanup();
  });

  it('renders the existing unstyled landlord shell when VITE_REDESIGN_ENABLED is unset (default off)', async () => {
    seedLandlordSession();
    const { container } = renderPortal();
    expect(await screen.findByRole('heading', { name: 'A clear view of your property portfolio.' })).toBeInTheDocument();
    // The redesigned shell's scoping class must never appear when the flag
    // is off — this is the "byte-for-byte reachable" control case.
    expect(container.querySelector('.kf-landlord-redesign')).not.toBeInTheDocument();
  });

  it('renders the existing unstyled landlord shell when VITE_REDESIGN_ENABLED is explicitly "false"', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'false');
    seedLandlordSession();
    const { container } = renderPortal();
    expect(await screen.findByRole('heading', { name: 'A clear view of your property portfolio.' })).toBeInTheDocument();
    expect(container.querySelector('.kf-landlord-redesign')).not.toBeInTheDocument();
  });

  it('renders the flag-gated redesigned landlord shell when VITE_REDESIGN_ENABLED is "true"', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    seedLandlordSession();
    const { container } = renderPortal();
    await waitFor(() => expect(container.querySelector('.kf-landlord-redesign')).toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'A clear view of your property portfolio.' })).toBeInTheDocument();
    // Same reused panel, same reused copy — only the shell chrome differs.
    expect(screen.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add a property' })).toBeInTheDocument();
    // Addendum §10.2: the next-best-action checklist card renders on the
    // Overview tab, computed only from data these hooks already fetch.
    const checklist = screen.getByTestId('next-best-action-checklist');
    expect(checklist).toBeInTheDocument();
    expect(within(checklist).getByText('Get your first listing live')).toBeInTheDocument();
    expect(within(checklist).getByText('Add a property')).toBeInTheDocument();
    expect(within(checklist).getAllByText('Status unknown').length).toBeGreaterThan(0);
  });

  it('clicking an unchecked checklist row scrolls to the existing property-management panel (§10.2, no new fetch)', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    seedLandlordSession();
    const { container } = renderPortal();
    await waitFor(() => expect(container.querySelector('.kf-landlord-redesign')).toBeInTheDocument());
    const anchor = container.querySelector('#kf-property-management-anchor');
    expect(anchor).toBeInTheDocument();
    const scrollSpy = vi.fn();
    anchor.scrollIntoView = scrollSpy;
    const checklist = screen.getByTestId('next-best-action-checklist');
    const addPropertyRow = within(checklist).getByText('Add a property').closest('button');
    addPropertyRow.click();
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  // Copilot PR #134 review finding #5: an 'unknown' row (e.g. "Set pricing
  // & availability", which is always 'unknown' today per §10.2 item 2)
  // must still be clickable/actionable — it must not be permanently
  // disabled just because its status can't be computed, since the actual
  // control for it exists below and is reachable exactly the same way as
  // every other unchecked row.
  it('clicking the "Set pricing & availability" row (status unknown) still scrolls to the property-management panel, matching every other unchecked row', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    seedLandlordSession();
    const { container } = renderPortal();
    await waitFor(() => expect(container.querySelector('.kf-landlord-redesign')).toBeInTheDocument());
    const anchor = container.querySelector('#kf-property-management-anchor');
    expect(anchor).toBeInTheDocument();
    const scrollSpy = vi.fn();
    anchor.scrollIntoView = scrollSpy;
    const checklist = screen.getByTestId('next-best-action-checklist');
    const setPricingRow = within(checklist).getByText('Set pricing & availability').closest('button');
    expect(setPricingRow).not.toBeDisabled();
    setPricingRow.click();
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('does not gate non-landlord roles into the redesign even when the flag is on', async () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    localStorage.setItem('keyforta.portal.session', JSON.stringify({ email: 'manager@test.keyforta.com', role: 'manager', issuedAt: '2026-09-18T00:00:00.000Z', organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }));
    const { container } = renderPortal();
    expect(await screen.findByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeInTheDocument();
    expect(container.querySelector('.kf-landlord-redesign')).not.toBeInTheDocument();
  });
});
