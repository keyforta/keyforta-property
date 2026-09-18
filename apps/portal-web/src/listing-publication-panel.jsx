import { useMemo, useState } from 'react';
import { Button, Input, Spinner } from '@fluentui/react-components';
import { createApiClient } from '@keyforta/api-client';
import {
  publicListingIdSchema,
  publicListingPublicationEnvelopeSchema,
} from '@keyforta/contracts';

function createListingPublicationClient(session) {
  return createApiClient({
    getOrganizationId: () => session?.organizationId ?? null,
    getToken: () => {
      if (session?.getAccessToken) return session.getAccessToken();
      throw new Error('Sign in with Microsoft Entra before changing listing publication.');
    },
  });
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

export function ListingPublicationPanel({
  emptyState = 'Assigned listings will appear here after the portfolio feed is available.',
  listings,
  session,
}) {
  const apiClient = useMemo(() => createListingPublicationClient(session), [session]);
  const [items, setItems] = useState(listings);
  const [busyListingId, setBusyListingId] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('');
  const [manualListingId, setManualListingId] = useState('');

  const runCommand = async (listingId, nextCommand) => {
    setBusyListingId(listingId);
    setMessage('');
    setMessageTone('');
    try {
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
      setMessage('Enter a listing ID to publish or withdraw.');
      setMessageTone('error');
      return;
    }
    try {
      const listingId = publicListingIdSchema.parse(manualListingId.trim());
      await runCommand(listingId, nextCommand);
    } catch {
      setMessage('Enter a valid listing ID.');
      setMessageTone('error');
    }
  };

  const disableActions = Boolean(busyListingId) || session?.sessionMode === 'demo' || !session?.getAccessToken;

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
      {disableActions ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          Demo portal sessions cannot change listing publication. Sign in with Microsoft Entra before sending publish or withdraw commands.
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
          id='manual-listing-id'
          onChange={(_, data) => setManualListingId(data.value)}
          placeholder='Paste a listing UUID'
          value={manualListingId}
        />
        <p className='publication-note'>
          Use a trusted listing ID when the portfolio feed is unavailable in this prototype shell.
        </p>
        <div className='manual-listing-actions'>
          <Button appearance='secondary' disabled={disableActions} onClick={(event) => submitManualCommand(event, 'publish')}>Publish by ID</Button>
          <Button appearance='secondary' disabled={disableActions} onClick={(event) => submitManualCommand(event, 'withdraw')}>Withdraw by ID</Button>
        </div>
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
