import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Spinner } from '@fluentui/react-components';
import { createApiClient } from '@keyforta/api-client';
import {
  publicListingIdSchema,
  publicListingPublicationEnvelopeSchema,
} from '@keyforta/contracts';

function isLoopbackHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

export function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_KEYFORTA_API_BASE_URL?.trim();
  if (!configured) return '/api/v1';
  if (configured.startsWith('/')) {
    return configured.replace(/\/+$/, '') || '/api/v1';
  }
  try {
    const url = new URL(configured);
    if (url.protocol === 'https:') return url.toString().replace(/\/+$/, '');
    if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return url.toString().replace(/\/+$/, '');
  } catch {
    return '/api/v1';
  }
  return '/api/v1';
}

function statusCopy(status) {
  if (status === 'published') {
    return {
      action: 'Withdraw',
      badge: 'Published',
      detail: 'Listing is live on the public marketplace.',
    };
  }
  if (status === 'draft') {
    return {
      action: 'Publish',
      badge: 'Draft',
      detail: 'Listing is still being prepared before publication.',
    };
  }
  return {
    action: 'Publish',
    badge: 'Withdrawn',
    detail: 'Listing is hidden from the public marketplace.',
  };
}

async function createListingPublicationClient(session) {
  const accessToken = await session.getAccessToken();
  return createApiClient({
    baseUrl: resolveApiBaseUrl(),
    getOrganizationId: () => session?.organizationId ?? null,
    getToken: () => accessToken,
  });
}

export function ListingPublicationPanel({
  emptyState = 'Assigned listings will appear here after the portfolio feed is available.',
  listings,
  session,
}) {
  const [items, setItems] = useState(listings);
  const [busyListingId, setBusyListingId] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('');
  const [manualListingId, setManualListingId] = useState('');
  const [manualListingError, setManualListingError] = useState('');
  const hasOrganizationContext = Boolean(session?.organizationId);
  const [tokenStatus, setTokenStatus] = useState(session?.sessionMode === 'demo' ? 'demo' : !hasOrganizationContext ? 'organization-unavailable' : session?.getAccessToken ? 'loading' : 'unavailable');
  const inputRef = useRef(null);
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

  useEffect(() => {
    let active = true;
    setItems(listings);
    if (session?.sessionMode === 'demo') {
      setTokenStatus('demo');
      return () => {
        active = false;
      };
    }
    if (!session?.organizationId) {
      setTokenStatus('organization-unavailable');
      return () => {
        active = false;
      };
    }
    if (!session?.getAccessToken) {
      setTokenStatus('unavailable');
      return () => {
        active = false;
      };
    }
    setTokenStatus('loading');
    session.getAccessToken()
      .then((token) => {
        if (!active) return;
        setTokenStatus(token ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (!active) return;
        setTokenStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, [listings, session]);

  const runCommand = async (listingId, nextCommand) => {
    if (tokenStatus !== 'ready' || !session?.getAccessToken || !session?.organizationId) return;
    setBusyListingId(listingId);
    setMessage('');
    setMessageTone('');
    try {
      const apiClient = await createListingPublicationClient(session);
      const payload = await apiClient.command('public-listings', listingId, nextCommand);
      const parsed = publicListingPublicationEnvelopeSchema.parse(payload);
      setItems((current) => current.map((item) => (
        item.id === parsed.data.listingId
          ? { ...item, status: parsed.data.status }
          : item
      )));
      setMessage(
        parsed.data.status === 'published'
          ? 'Listing published successfully.'
          : 'Listing withdrawn successfully.',
      );
      setMessageTone('success');
    } catch (error) {
      if (error?.code === 'NOT_FOUND') {
        setMessage('Listing not found or not assigned to you.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Listing status could not be updated right now.');
      }
      setMessageTone('error');
    } finally {
      setBusyListingId('');
    }
  };

  const submitManualCommand = async (event, nextCommand) => {
    event.preventDefault();
    if (!manualListingId.trim()) {
      setManualListingError('Enter a listing ID to publish or withdraw.');
      setMessage('');
      setMessageTone('');
      inputRef.current?.focus();
      return;
    }
    try {
      const listingId = publicListingIdSchema.parse(manualListingId.trim());
      setManualListingError('');
      await runCommand(listingId, nextCommand);
    } catch {
      setManualListingError('Enter a valid listing ID.');
      setMessage('');
      setMessageTone('');
      inputRef.current?.focus();
    }
  };

  const disableActions = Boolean(busyListingId) || tokenStatus !== 'ready';
  const manualBusy = busyListingId && !items.some((item) => item.id === busyListingId);

  return (
    <section
      aria-labelledby='listing-publication-title'
      className='panel listing-panel'
    >
      <div className='panel-head'>
        <div>
          <p className='kicker'>Listing publication</p>
          <h2 id='listing-publication-title'>Publish or withdraw assigned listings</h2>
        </div>
      </div>
      <p className='publication-note'>
        Use the existing publication commands for listings already assigned to your organization context.
      </p>
      {apiBaseUrl === '/api/v1' && import.meta.env.VITE_KEYFORTA_API_BASE_URL?.trim() ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          Listing publication ignored an insecure API base URL and fell back to the approved relative API path.
        </p>
      ) : null}
      {tokenStatus === 'loading' ? (
        <p className='publication-feedback' data-tone='success' role='status'>Resolving your portal access token…</p>
      ) : null}
      {tokenStatus === 'demo' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          Demo portal sessions cannot change listing publication. Sign in with Microsoft Entra before sending publish or withdraw commands.
        </p>
      ) : null}
      {tokenStatus === 'organization-unavailable' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          Listing publication is unavailable until an organization context is selected for this portal session.
        </p>
      ) : null}
      {tokenStatus === 'unavailable' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          Listing publication is unavailable until Microsoft Entra access is connected for this portal session.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className='publication-empty'>{emptyState}</p>
      ) : (
        <div className='rows' role='list' aria-label='Assigned listings'>
          {items.map((listing) => {
            const copy = statusCopy(listing.status);
            const isBusy = busyListingId === listing.id;
            return (
              <div key={listing.id} className='listing-row' role='listitem'>
                <div className='listing-copy'>
                  <strong>{listing.title}</strong>
                  <span className='listing-id'>{listing.id}</span>
                  <span className='listing-meta'>{copy.detail}</span>
                  <span className='listing-note'>{listing.note}</span>
                </div>
                <span className='status'>{copy.badge}</span>
                <Button
                  aria-label={isBusy ? `Saving ${listing.title}` : `${copy.action} ${listing.title}`}
                  disabled={disableActions}
                  onClick={() => runCommand(listing.id, copy.action.toLowerCase())}
                >
                  {isBusy ? <><Spinner size='tiny' /> Saving…</> : copy.action}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <div className='manual-listing-form'>
        <label htmlFor='manual-listing-id'>Listing ID</label>
        <Input
          aria-describedby={manualListingError ? 'manual-listing-id-error' : 'manual-listing-id-help'}
          aria-invalid={manualListingError ? 'true' : 'false'}
          id='manual-listing-id'
          onChange={(_, data) => {
            setManualListingId(data.value);
            if (manualListingError) setManualListingError('');
          }}
          placeholder='Paste a listing UUID'
          ref={inputRef}
          value={manualListingId}
        />
        <p className='publication-note' id='manual-listing-id-help'>
          Use a trusted listing ID when the portfolio feed is unavailable in this prototype shell.
        </p>
        {manualListingError ? <p className='publication-feedback' data-tone='error' id='manual-listing-id-error'>{manualListingError}</p> : null}
        <div className='manual-listing-actions'>
          <Button appearance='secondary' disabled={disableActions} onClick={(event) => submitManualCommand(event, 'publish')}>Publish by ID</Button>
          <Button appearance='secondary' disabled={disableActions} onClick={(event) => submitManualCommand(event, 'withdraw')}>Withdraw by ID</Button>
        </div>
        {manualBusy ? <p className='publication-feedback' data-tone='success' role='status'>Sending listing publication command…</p> : null}
      </div>
      {message ? (
        <p
          className='publication-feedback'
          data-tone={messageTone}
          role={messageTone === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
