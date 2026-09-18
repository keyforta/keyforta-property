import { useMemo, useState } from 'react';
import { Badge, Button, Input, Spinner } from '@fluentui/react-components';
import { createApiClient } from '@keyforta/api-client';
import {
  publicListingIdSchema,
  publicListingPublicationEnvelopeSchema,
} from '@keyforta/contracts';

export const demoManagerListings = [
  {
    id: '6d5f0d4f-e7ca-4c96-b67b-513f871f3f1a',
    title: 'Riverside apartment · Unit 2A',
    status: 'withdrawn',
    note: 'Ready to publish once photos and pricing are confirmed.',
  },
  {
    id: '10b5c5ca-4daf-4df7-afb3-8a8a9698f0e1',
    title: 'Garden residence · Unit 1B',
    status: 'published',
    note: 'Currently visible to public visitors.',
  },
];

function statusCopy(status) {
  return status === 'published'
    ? {
        action: 'Withdraw',
        badge: 'Published',
        detail: 'Listing is live on the public marketplace.',
      }
    : {
        action: 'Publish',
        badge: 'Withdrawn',
        detail: 'Listing is hidden from the public marketplace.',
      };
}

function createListingPublicationClient(session) {
  return createApiClient({
    getOrganizationId: () => session?.organizationId ?? null,
    getToken: () => session?.token ?? null,
  });
}

export function ListingPublicationPanel({ session, listings = demoManagerListings }) {
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
        setMessage('Listing status could not be updated right now.');
      }
      setMessageTone('error');
    } finally {
      setBusyListingId('');
    }
  };

  const submitManualListing = async (event) => {
    event.preventDefault();
    if (!manualListingId.trim()) {
      setMessage('Enter a listing ID to publish or withdraw.');
      setMessageTone('error');
      return;
    }
    try {
      const listingId = publicListingIdSchema.parse(manualListingId.trim());
      const matching = items.find((item) => item.id === listingId);
      const currentStatus = matching?.status ?? 'withdrawn';
      await runCommand(
        listingId,
        currentStatus === 'published' ? 'withdraw' : 'publish',
      );
    } catch {
      setMessage('Enter a valid listing ID.');
      setMessageTone('error');
    }
  };

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
              <Badge appearance='tint' className='status'>{copy.badge}</Badge>
              <Button
                aria-label={`${copy.action} ${listing.title}`}
                disabled={Boolean(busyListingId)}
                onClick={() => runCommand(listing.id, copy.action.toLowerCase())}
              >
                {isBusy ? <><Spinner size='tiny' /> Saving…</> : copy.action}
              </Button>
            </div>
          );
        })}
      </div>
      <form className='manual-listing-form' onSubmit={submitManualListing}>
        <label htmlFor='manual-listing-id'>Listing ID</label>
        <Input
          id='manual-listing-id'
          onChange={(_, data) => setManualListingId(data.value)}
          placeholder='Paste a listing UUID'
          value={manualListingId}
        />
        <div className='manual-listing-actions'>
          <Button type='submit' appearance='secondary'>Toggle publication by ID</Button>
        </div>
      </form>
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
