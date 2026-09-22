import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@keyforta/ui', () => ({
  AppBrand: ({ surface }) => <div>{surface} brand</div>,
  MetricCard: ({ label, value, note }) => <div><strong>{label}</strong><span>{value}</span><small>{note}</small></div>,
}));

const command = vi.hoisted(() => vi.fn());
const createApiClientOptions = vi.hoisted(() => []);
const createApiClientMock = vi.hoisted(() => vi.fn((options) => {
  createApiClientOptions.push(options);
  return { command };
}));
vi.mock('@keyforta/api-client', () => ({
  createApiClient: createApiClientMock,
}));

import { ListingPublicationPanel, resolveApiBaseUrl } from '../src/listing-publication-panel.jsx';
import i18n from '../src/i18n.js';

const listings = [
  { id: '6d5f0d4f-e7ca-4c96-b67b-513f871f3f1a', title: 'Riverside apartment · Unit 2A', status: 'withdrawn', note: 'Ready to publish.' },
  { id: '10b5c5ca-4daf-4df7-afb3-8a8a9698f0e1', title: 'Garden residence · Unit 1B', status: 'published', note: 'Currently visible.' },
  { id: '5d57d770-f831-4dfe-a85f-7705244f6d4a', title: 'Hill view loft · Unit 3C', status: 'draft', note: 'Awaiting photos.' },
];

const baseSession = {
  email: 'manager@example.com',
  role: 'manager',
  issuedAt: '2026-09-18T00:00:00.000Z',
  getAccessToken: () => Promise.resolve('token-123'),
  organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
};

function renderPanel(props = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ListingPublicationPanel session={baseSession} listings={listings} {...props} />
    </FluentProvider>,
  );
}

describe('resolveApiBaseUrl', () => {
  const original = import.meta.env.VITE_KEYFORTA_API_BASE_URL;

  beforeEach(() => {
    vi.stubEnv('VITE_KEYFORTA_API_BASE_URL', original ?? '');
  });

  it('falls back to the relative api path for an insecure remote origin', () => {
    vi.stubEnv('VITE_KEYFORTA_API_BASE_URL', 'http://insecure.example.com/api/v1');
    expect(resolveApiBaseUrl()).toEqual({ baseUrl: '/api/v1', rejectedConfiguredValue: true });
  });

  it('normalizes trailing slashes from configured absolute api roots', () => {
    vi.stubEnv('VITE_KEYFORTA_API_BASE_URL', 'https://api.example.test/api/v1///');
    expect(resolveApiBaseUrl()).toEqual({ baseUrl: 'https://api.example.test/api/v1', rejectedConfiguredValue: false });
  });

  it('rejects protocol-relative api roots that would leak tokens cross-origin', () => {
    vi.stubEnv('VITE_KEYFORTA_API_BASE_URL', '//attacker.example/api/v1');
    expect(resolveApiBaseUrl()).toEqual({ baseUrl: '/api/v1', rejectedConfiguredValue: true });
  });

  it('does not flag a valid relative api root as rejected', () => {
    vi.stubEnv('VITE_KEYFORTA_API_BASE_URL', '/api/v1');
    expect(resolveApiBaseUrl()).toEqual({ baseUrl: '/api/v1', rejectedConfiguredValue: false });
  });
});

describe('ListingPublicationPanel', () => {
  beforeEach(() => {
    command.mockReset();
    createApiClientMock.mockClear();
    createApiClientOptions.length = 0;
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_KEYFORTA_API_BASE_URL', '');
    i18n.changeLanguage('en');
  });

  it('renders an explicit sign-in retry affordance after silent readiness is deferred', async () => {
    const deferredSession = {
      ...baseSession,
      getAccessToken: vi.fn().mockRejectedValue(new Error('Interaction required.')),
    };
    renderPanel({ session: deferredSession });

    expect(screen.getByText(/Sign in with Microsoft Entra to enable listing publication/i)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Sign in to continue' });
    expect(button).toBeEnabled();
    expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeDisabled();
  });

  it('invokes interactive sign-in and retries token acquisition when clicking "Sign in to continue"', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    let silentAttempts = 0;
    const deferredSession = {
      ...baseSession,
      signIn,
      getAccessToken: vi.fn(() => {
        silentAttempts += 1;
        return silentAttempts === 1
          ? Promise.reject(new Error('Interaction required.'))
          : Promise.resolve('token-after-sign-in');
      }),
    };
    renderPanel({ session: deferredSession });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(deferredSession.getAccessToken).toHaveBeenCalledTimes(2);
  });

  it('refreshes the access token for each command', async () => {
    const getAccessToken = vi.fn()
      .mockResolvedValueOnce('token-1')
      .mockResolvedValueOnce('token-2')
      .mockResolvedValueOnce('token-3');
    command
      .mockResolvedValueOnce({ data: { listingId: listings[0].id, status: 'published' }, meta: { requestId: 'req-1' } })
      .mockResolvedValueOnce({ data: { listingId: listings[1].id, status: 'withdrawn' }, meta: { requestId: 'req-2' } });
    renderPanel({ session: { ...baseSession, getAccessToken } });

    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Publish Riverside apartment · Unit 2A/i }));
    await waitFor(() => expect(command).toHaveBeenNthCalledWith(1, 'public-listings', listings[0].id, 'publish'));
    fireEvent.click(screen.getByRole('button', { name: /Withdraw Garden residence · Unit 1B/i }));
    await waitFor(() => expect(command).toHaveBeenNthCalledWith(2, 'public-listings', listings[1].id, 'withdraw'));
    expect(getAccessToken).toHaveBeenCalledTimes(3);
    expect(createApiClientOptions[0].getToken()).toBe('token-2');
    expect(createApiClientOptions[1].getToken()).toBe('token-3');
  });

  it('sends the stable English API command even when the UI language is French', async () => {
    command.mockResolvedValueOnce({ data: { listingId: listings[0].id, status: 'published' }, meta: { requestId: 'req-1' } });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());

    await act(async () => { await i18n.changeLanguage('fr'); });
    const publishButton = await screen.findByRole('button', { name: /Publier Riverside apartment/i });
    fireEvent.click(publishButton);

    await waitFor(() => expect(command).toHaveBeenCalledWith('public-listings', listings[0].id, 'publish'));
  });

  it('uses a normalized absolute api root without a double slash in the request path', async () => {
    vi.stubEnv('VITE_KEYFORTA_API_BASE_URL', 'https://api.example.test/api/v1///');
    command.mockResolvedValue({ data: { listingId: listings[0].id, status: 'published' }, meta: { requestId: 'req-1' } });
    renderPanel();

    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Publish Riverside apartment · Unit 2A/i }));

    await waitFor(() => expect(createApiClientMock).toHaveBeenCalled());
    expect(createApiClientMock.mock.calls.at(-1)[0].baseUrl).toBe('https://api.example.test/api/v1');
    await waitFor(() => expect(command).toHaveBeenCalledWith('public-listings', listings[0].id, 'publish'));
  });

  it('publishes a withdrawn listing and updates the status', async () => {
    command.mockResolvedValue({ data: { listingId: listings[0].id, status: 'published' }, meta: { requestId: 'req-1' } });
    renderPanel();

    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Publish Riverside apartment · Unit 2A/i }));

    await waitFor(() => expect(command).toHaveBeenCalledWith('public-listings', listings[0].id, 'publish'));
    expect(await screen.findByText('Listing published successfully.')).toBeInTheDocument();
    expect(screen.getAllByText('Published').length).toBeGreaterThanOrEqual(2);
  });

  it('withdraws a published listing and updates the status', async () => {
    command.mockResolvedValue({ data: { listingId: listings[1].id, status: 'withdrawn' }, meta: { requestId: 'req-2' } });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Withdraw Garden residence/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Withdraw Garden residence · Unit 1B/i }));

    await waitFor(() => expect(command).toHaveBeenCalledWith('public-listings', listings[1].id, 'withdraw'));
    expect(await screen.findByText('Listing withdrawn successfully.')).toBeInTheDocument();
    expect(screen.getAllByText('Withdrawn').length).toBeGreaterThanOrEqual(2);
  });

  it('shows draft listings separately from withdrawn listings', async () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Listing is still being prepared before publication.')).toBeInTheDocument();
  });

  it('renders a non-disclosing denial when the manager is not assigned', async () => {
    const error = new Error('Listing not found.');
    error.code = 'NOT_FOUND';
    command.mockRejectedValue(error);
    renderPanel();

    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Publish Riverside apartment · Unit 2A/i }));

    expect(await screen.findByText('Listing not found or not assigned to you.')).toBeInTheDocument();
  });

  it('passes distinct cross-organization context while rendering the same non-disclosing denial', async () => {
    command.mockImplementation(async (resource, listingId, name) => {
      const organizationId = createApiClientMock.mock.calls.at(-1)[0].getOrganizationId();
      if (organizationId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
        const error = new Error('Listing not found.');
        error.code = 'NOT_FOUND';
        throw error;
      }
      return { data: { listingId, status: name === 'publish' ? 'published' : 'withdrawn' }, meta: { requestId: 'req-cross' } };
    });
    const crossOrgSession = { ...baseSession, organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    renderPanel({ session: crossOrgSession });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Withdraw Garden residence/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Withdraw Garden residence · Unit 1B/i }));

    await waitFor(() => expect(createApiClientMock).toHaveBeenCalled());
    expect(createApiClientMock.mock.calls.at(-1)[0].getOrganizationId()).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(await screen.findByText('Listing not found or not assigned to you.')).toBeInTheDocument();
  });

  it('renders an infrastructure failure separately from denial', async () => {
    const error = new Error('Publication service unavailable.');
    error.code = 'DEPENDENCY_UNAVAILABLE';
    command.mockRejectedValue(error);
    renderPanel();

    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Publish Riverside apartment · Unit 2A/i }));

    expect(await screen.findByText('Publication service unavailable.')).toBeInTheDocument();
  });

  it('does not render a manual listing-ID entry point (issue #114: feed replaces manual entry)', async () => {
    renderPanel();
    expect(screen.queryByLabelText('Listing ID')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish by ID' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw by ID' })).not.toBeInTheDocument();
  });

  it('shows an assignment-scoped empty message (not a manual-ID fallback) when the portfolio feed has no listings', async () => {
    renderPanel({ listings: [], emptyState: 'No listings are currently assigned to you. Listings you are assigned to manage will appear here automatically.' });
    expect(screen.getByText(/No listings are currently assigned to you/i)).toBeInTheDocument();
    expect(screen.queryByText(/Use a trusted listing ID/i)).not.toBeInTheDocument();
  });

  it('disables live mutation controls for demo sessions', () => {
    renderPanel({ session: { ...baseSession, sessionMode: 'demo', getAccessToken: undefined } });
    expect(screen.getByText(/Demo portal sessions cannot change listing publication/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeDisabled();
  });

  it('disables live mutation controls when organization context is missing', async () => {
    renderPanel({ session: { ...baseSession, organizationId: null } });
    expect(screen.getByText(/Listing publication is unavailable until an organization context is selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeDisabled();
    expect(command).not.toHaveBeenCalled();
  });

  it('disables live mutation controls for non-demo sessions without a token getter', () => {
    renderPanel({ session: { ...baseSession, getAccessToken: undefined } });
    expect(screen.getByText(/Listing publication is unavailable until Microsoft Entra access is connected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeDisabled();
  });

  it('silently re-arms write access on mount when getAccessTokenSilent resolves a token, without a manual click (issue #123)', async () => {
    const getAccessTokenSilent = vi.fn().mockResolvedValue('silent-token');
    renderPanel({ session: { ...baseSession, getAccessTokenSilent } });

    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Sign in to continue' })).not.toBeInTheDocument();
    expect(getAccessTokenSilent).toHaveBeenCalledTimes(1);
  });

  it('keeps the manual sign-in affordance when getAccessTokenSilent resolves without a token', async () => {
    const getAccessTokenSilent = vi.fn().mockResolvedValue(null);
    renderPanel({ session: { ...baseSession, getAccessTokenSilent } });

    await waitFor(() => expect(getAccessTokenSilent).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeDisabled();
  });

  it('keeps the manual sign-in affordance when getAccessTokenSilent rejects', async () => {
    const getAccessTokenSilent = vi.fn().mockRejectedValue(new Error('Interaction required.'));
    renderPanel({ session: { ...baseSession, getAccessTokenSilent } });

    await waitFor(() => expect(getAccessTokenSilent).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeDisabled();
  });

  it('does not re-arm-check or drop an already-armed session when only the portfolio feed refreshes', async () => {
    const getAccessTokenSilent = vi.fn().mockResolvedValue('silent-token');
    const session = { ...baseSession, getAccessTokenSilent };
    const { rerender } = render(
      <FluentProvider theme={webLightTheme}>
        <ListingPublicationPanel session={session} listings={listings} />
      </FluentProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled());
    expect(getAccessTokenSilent).toHaveBeenCalledTimes(1);

    const refreshedListings = listings.map((listing) => ({ ...listing }));
    rerender(
      <FluentProvider theme={webLightTheme}>
        <ListingPublicationPanel session={session} listings={refreshedListings} />
      </FluentProvider>,
    );

    expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Sign in to continue' })).not.toBeInTheDocument();
    expect(getAccessTokenSilent).toHaveBeenCalledTimes(1);
  });

  it('has no critical accessibility violations', async () => {
    const { container } = renderPanel();
    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
    expect((await axe(container)).violations).toEqual([]);
  });
});
