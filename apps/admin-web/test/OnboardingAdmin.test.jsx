import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authState: { current: { status: 'signed-out' } },
  listMock: vi.fn(),
  decideMock: vi.fn(),
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

vi.mock('../src/onboarding-api.js', () => ({
  createOnboardingApi: () => ({
    list: mocks.listMock,
    decide: mocks.decideMock,
  }),
}));

import { OnboardingAdmin } from '../src/OnboardingAdmin.jsx';
import i18n from '../src/i18n.js';

function renderAdmin() {
  return render(<FluentProvider theme={webLightTheme}><OnboardingAdmin /></FluentProvider>);
}

const application = {
  id: 'app-1', applicantName: 'Amina K.', proposedOrganizationName: 'Riverside Homes', submittedAt: '2026-09-01T10:00:00.000Z', status: 'pending', decisionReason: ''
};

describe('OnboardingAdmin', () => {
  beforeEach(() => {
    mocks.authState.current = { status: 'signed-in', account: { name: 'Admin User', username: 'admin@test.keyforta.com' } };
    mocks.listMock.mockReset();
    mocks.decideMock.mockReset();
    mocks.signInMock.mockReset();
    mocks.signOutMock.mockReset();
    mocks.initializeMock.mockReset();
    i18n.changeLanguage('en');
  });

  it('renders a loading queue state before applications load', () => {
    mocks.listMock.mockImplementation(() => new Promise(() => {}));
    renderAdmin();
    expect(screen.getByText('Loading applications...')).toBeInTheDocument();
  });

  it('renders the empty state when no applications are awaiting review', async () => {
    mocks.listMock.mockResolvedValue([]);
    renderAdmin();
    expect(await screen.findByText('No onboarding applications are awaiting review.')).toBeInTheDocument();
  });

  it('renders an access denied state for unauthorized reviewers', async () => {
    mocks.listMock.mockRejectedValue({ status: 404 });
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(screen.getByText('This identity is not authorized to review onboarding applications.')).toBeInTheDocument();
  });

  it('renders an error state when the queue cannot load', async () => {
    mocks.listMock.mockRejectedValue({ code: 'API_UNAVAILABLE' });
    renderAdmin();
    expect(await screen.findByRole('alert')).toHaveTextContent('The admin API is not configured.');
  });

  it('submits a decision reason and updates the reviewed application', async () => {
    mocks.listMock.mockResolvedValue([application]);
    mocks.decideMock.mockResolvedValue({ ...application, status: 'approved', decisionReason: 'Verified documents', decidedAt: '2026-09-02T11:00:00.000Z' });
    renderAdmin();
    const textbox = await screen.findByRole('textbox', { name: 'Decision reason' });
    fireEvent.change(textbox, { target: { value: 'Verified documents' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(mocks.decideMock).toHaveBeenCalledWith('app-1', { decision: 'approved', reason: 'Verified documents' }));
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Verified documents')).toBeInTheDocument();
  });

  it('has no critical accessibility violations for the signed-out gate', async () => {
    mocks.authState.current = { status: 'signed-out' };
    const { container } = renderAdmin();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('switches the console to French when the language toggle is used', async () => {
    mocks.listMock.mockResolvedValue([]);
    renderAdmin();
    await screen.findByText('No onboarding applications are awaiting review.');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to French' }));
    expect(await screen.findByText("Aucune demande d'accueil n'est en attente d'examen.")).toBeInTheDocument();
  });

  it('translates the application status badge instead of showing the raw API value', async () => {
    mocks.listMock.mockResolvedValue([application]);
    renderAdmin();
    await screen.findByText('Amina K.');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to French' }));
    expect(await screen.findByText('En attente')).toBeInTheDocument();
    expect(screen.queryByText('pending')).not.toBeInTheDocument();
  });
});
