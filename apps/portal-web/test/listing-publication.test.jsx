import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@keyforta/ui', () => ({
  AppBrand: ({ surface }) => <div>{surface} brand</div>,
  MetricCard: ({ label, value, note }) => <div><strong>{label}</strong><span>{value}</span><small>{note}</small></div>,
}));

const command = vi.hoisted(() => vi.fn());
const createApiClientMock = vi.hoisted(() => vi.fn(() => ({ command })));
vi.mock('@keyforta/api-client', () => ({
  createApiClient: createApiClientMock,
}));

import { ListingPublicationPanel } from '../src/listing-publication-panel.jsx';

const baseSession = {
  email: 'manager@example.com',
  role: 'manager',
  issuedAt: '2026-09-18T00:00:00.000Z',
  getAccessToken: async () => 'token-123',
  organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
};

const listings = [
  { id: '6d5f0d4f-e7ca-4c96-b67b-513f871f3f1a', title: 'Riverside apartment · Unit 2A', status: 'withdrawn', note: 'Ready to publish.' },
  { id: '10b5c5ca-4daf-4df7-afb3-8a8a9698f0e1', title: 'Garden residence · Unit 1B', status: 'published', note: 'Currently visible.' },
  { id: '5d57d770-f831-4dfe-a85f-7705244f6d4a', title: 'Hill view loft · Unit 3C', status: 'draft', note: 'Awaiting photos.' },
];

function renderPanel(props = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ListingPublicationPanel session={baseSession} listings={listings} {...props} />
    </FluentProvider>,
  );
}

describe('ListingPublicationPanel', () => {
  beforeEach(() => {
    command.mockReset();
    createApiClientMock.mockClear();
  });

  it('publishes a withdrawn listing and updates the status', async () => {
    command.mockResolvedValue({ data: { listingId: listings[0].id, status: 'published' }, meta: { requestId: 'req-1' } });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Publish Riverside apartment · Unit 2A/i }));

    await waitFor(() => expect(command).toHaveBeenCalledWith('public-listings', listings[0].id, 'publish'));
    expect(await screen.findByRole('status')).toHaveTextContent('Listing published successfully.');
    expect(screen.getAllByText('Published').length).toBeGreaterThanOrEqual(2);
  });

  it('withdraws a published listing and updates the status', async () => {
    command.mockResolvedValue({ data: { listingId: listings[1].id, status: 'withdrawn' }, meta: { requestId: 'req-2' } });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Withdraw Garden residence · Unit 1B/i }));

    await waitFor(() => expect(command).toHaveBeenCalledWith('public-listings', listings[1].id, 'withdraw'));
    expect(await screen.findByRole('status')).toHaveTextContent('Listing withdrawn successfully.');
    expect(screen.getAllByText('Withdrawn').length).toBeGreaterThanOrEqual(2);
  });

  it('shows draft listings separately from withdrawn listings', () => {
    renderPanel();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Listing is still being prepared before publication.')).toBeInTheDocument();
  });

  it('renders a non-disclosing denial when the manager is not assigned', async () => {
    const error = new Error('Listing not found.');
    error.code = 'NOT_FOUND';
    error.details = {};
    error.traceId = 'trace-denied';
    command.mockRejectedValue(error);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Publish Riverside apartment · Unit 2A/i }));

    expect(await screen.findByText('Listing not found or not assigned to you.')).toBeInTheDocument();
  });

  it('passes distinct cross-organization context while rendering the same non-disclosing denial', async () => {
    command.mockImplementation(async (resource, listingId, name) => {
      const organizationId = createApiClientMock.mock.calls.at(-1)[0].getOrganizationId();
      if (organizationId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
        const error = new Error('Listing not found.');
        error.code = 'NOT_FOUND';
        error.details = {};
        error.traceId = 'trace-cross-org';
        throw error;
      }
      return { data: { listingId, status: name === 'publish' ? 'published' : 'withdrawn' }, meta: { requestId: 'req-cross' } };
    });
    const crossOrgSession = { ...baseSession, organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    renderPanel({ session: crossOrgSession });

    fireEvent.click(screen.getByRole('button', { name: /Withdraw Garden residence · Unit 1B/i }));

    expect(createApiClientMock).toHaveBeenCalledWith(expect.objectContaining({ getOrganizationId: expect.any(Function) }));
    expect(createApiClientMock.mock.calls.at(-1)[0].getOrganizationId()).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    // The API intentionally returns the same 404 outcome for inaccessible and unknown listings.
    expect(await screen.findByText('Listing not found or not assigned to you.')).toBeInTheDocument();
  });

  it('renders an infrastructure failure separately from denial', async () => {
    const error = new Error('Publication service unavailable.');
    error.code = 'DEPENDENCY_UNAVAILABLE';
    error.details = {};
    error.traceId = 'trace-unavailable';
    command.mockRejectedValue(error);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Publish Riverside apartment · Unit 2A/i }));

    expect(await screen.findByText('Publication service unavailable.')).toBeInTheDocument();
  });

  it('supports explicit publish and withdraw commands by manual listing id', async () => {
    command.mockResolvedValue({ data: { listingId: listings[0].id, status: 'published' }, meta: { requestId: 'req-manual-publish' } });
    renderPanel();

    fireEvent.change(screen.getByLabelText('Listing ID'), { target: { value: listings[0].id } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish by ID' }));
    await waitFor(() => expect(command).toHaveBeenNthCalledWith(1, 'public-listings', listings[0].id, 'publish'));

    command.mockResolvedValueOnce({ data: { listingId: listings[0].id, status: 'withdrawn' }, meta: { requestId: 'req-manual-withdraw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw by ID' }));
    await waitFor(() => expect(command).toHaveBeenNthCalledWith(2, 'public-listings', listings[0].id, 'withdraw'));
  });

  it('rejects invalid manual listing ids before calling the api', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Listing ID'), { target: { value: 'not-a-uuid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish by ID' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid listing ID.');
    expect(command).not.toHaveBeenCalled();
  });

  it('disables live mutation controls for demo or tokenless sessions', () => {
    renderPanel({ session: { ...baseSession, sessionMode: 'demo', getAccessToken: undefined } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Demo portal sessions cannot change listing publication/i);
    expect(screen.getByRole('button', { name: /Publish Riverside apartment/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish by ID' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Withdraw by ID' })).toBeDisabled();
  });

  it('has no critical accessibility violations', async () => {
    const { container } = renderPanel();
    expect((await axe(container)).violations).toEqual([]);
  });
});
