import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Spinner } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import i18n from './i18n.js';
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
  if (!configured) return { baseUrl: '/api/v1', rejectedConfiguredValue: false };
  if (configured.startsWith('//')) return { baseUrl: '/api/v1', rejectedConfiguredValue: true };
  if (configured.startsWith('/')) {
    return {
      baseUrl: configured.replace(/\/+$/, '') || '/api/v1',
      rejectedConfiguredValue: false,
    };
  }
  try {
    const url = new URL(configured);
    if (url.protocol === 'https:') {
      return { baseUrl: url.toString().replace(/\/+$/, ''), rejectedConfiguredValue: false };
    }
    if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) {
      return { baseUrl: url.toString().replace(/\/+$/, ''), rejectedConfiguredValue: false };
    }
  } catch {
    return { baseUrl: '/api/v1', rejectedConfiguredValue: true };
  }
  return { baseUrl: '/api/v1', rejectedConfiguredValue: true };
}

function statusCopy(status, t) {
  const key = status === 'published' ? 'published' : status === 'draft' ? 'draft' : 'withdrawn';
  return {
    action: t(`listing_publication.status.${key}.action`),
    badge: t(`listing_publication.status.${key}.badge`),
    detail: t(`listing_publication.status.${key}.detail`),
  };
}

async function createListingPublicationClient(session, accessToken) {
  return createApiClient({
    baseUrl: resolveApiBaseUrl().baseUrl,
    getOrganizationId: () => session?.organizationId ?? null,
    getToken: () => accessToken,
  });
}

async function resolveCommandAccessToken(session) {
  if (!session?.getAccessToken) throw new Error(i18n.t('listing_publication.sign_in_first'));
  return session.getAccessToken();
}

export function ListingPublicationPanel({
  emptyState,
  listings,
  session,
}) {
  const { t } = useTranslation();
  const resolvedEmptyState = emptyState ?? t('listing_publication.empty_state');
  const [items, setItems] = useState(listings);
  const [busyListingId, setBusyListingId] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('');
  const [manualListingId, setManualListingId] = useState('');
  const [manualListingError, setManualListingError] = useState('');
  const hasOrganizationContext = Boolean(session?.organizationId);
  const [tokenStatus, setTokenStatus] = useState(session?.sessionMode === 'demo' ? 'demo' : !hasOrganizationContext ? 'organization-unavailable' : session?.getAccessToken ? 'sign-in-required' : 'unavailable');
  const inputRef = useRef(null);
  const apiConfig = useMemo(() => resolveApiBaseUrl(), []);

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
    setTokenStatus('sign-in-required');
    return () => {
      active = false;
    };
  }, [listings, session]);

  const enableLiveCommands = async () => {
    if (!session?.getAccessToken || !session?.organizationId) return;
    setMessage('');
    setMessageTone('');
    setTokenStatus('loading');
    try {
      let accessToken;
      try {
        accessToken = await resolveCommandAccessToken(session);
      } catch (error) {
        if (typeof session.signIn === 'function') {
          await session.signIn();
          accessToken = await resolveCommandAccessToken(session);
        } else {
          throw error;
        }
      }
      if (!accessToken) {
        setTokenStatus('sign-in-required');
        return;
      }
      setTokenStatus('ready');
    } catch (error) {
      setTokenStatus('sign-in-required');
      setMessage(error instanceof Error ? error.message : t('listing_publication.sign_in_error'));
      setMessageTone('error');
    }
  };

  const runCommand = async (listingId, nextCommand) => {
    if (tokenStatus !== 'ready' || !session?.getAccessToken || !session?.organizationId) return;
    setBusyListingId(listingId);
    setMessage('');
    setMessageTone('');
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createListingPublicationClient(session, accessToken);
      const payload = await apiClient.command('public-listings', listingId, nextCommand);
      const parsed = publicListingPublicationEnvelopeSchema.parse(payload);
      setItems((current) => current.map((item) => (
        item.id === parsed.data.listingId
          ? { ...item, status: parsed.data.status }
          : item
      )));
      setMessage(
        parsed.data.status === 'published'
          ? t('listing_publication.published_success')
          : t('listing_publication.withdrawn_success'),
      );
      setMessageTone('success');
    } catch (error) {
      if (error?.code === 'NOT_FOUND') {
        setMessage(t('listing_publication.not_found'));
      } else {
        setMessage(error instanceof Error ? error.message : t('listing_publication.update_failed'));
      }
      setMessageTone('error');
    } finally {
      setBusyListingId('');
    }
  };

  const submitManualCommand = async (event, nextCommand) => {
    event.preventDefault();
    if (!manualListingId.trim()) {
      setManualListingError(t('listing_publication.enter_listing_id'));
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
      setManualListingError(t('listing_publication.invalid_listing_id'));
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
          <p className='kicker'>{t('listing_publication.kicker')}</p>
          <h2 id='listing-publication-title'>{t('listing_publication.title')}</h2>
        </div>
      </div>
      <p className='publication-note'>
        {t('listing_publication.note')}
      </p>
      {apiConfig.rejectedConfiguredValue ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          {t('listing_publication.rejected_base_url')}
        </p>
      ) : null}
      {tokenStatus === 'loading' ? (
        <p className='publication-feedback' data-tone='success' role='status'>{t('listing_publication.resolving_token')}</p>
      ) : null}
      {tokenStatus === 'demo' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          {t('listing_publication.demo_session')}
        </p>
      ) : null}
      {tokenStatus === 'organization-unavailable' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          {t('listing_publication.organization_unavailable')}
        </p>
      ) : null}
      {tokenStatus === 'sign-in-required' ? (
        <div className='publication-feedback' data-tone='error' role='alert'>
          <p>{t('listing_publication.sign_in_required')}</p>
          <Button appearance='secondary' onClick={enableLiveCommands}>{t('listing_publication.sign_in_to_continue')}</Button>
        </div>
      ) : null}
      {tokenStatus === 'unavailable' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          {t('listing_publication.unavailable')}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className='publication-empty'>{resolvedEmptyState}</p>
      ) : (
        <div className='rows' role='list' aria-label={t('listing_publication.assigned_listings')}>
          {items.map((listing) => {
            const copy = statusCopy(listing.status, t);
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
                  aria-label={isBusy ? t('listing_publication.saving_named', { title: listing.title }) : t('listing_publication.action_named', { action: copy.action, title: listing.title })}
                  disabled={disableActions}
                  onClick={() => runCommand(listing.id, copy.action.toLowerCase())}
                >
                  {isBusy ? <><Spinner size='tiny' /> {t('listing_publication.saving')}</> : copy.action}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <div className='manual-listing-form'>
        <label htmlFor='manual-listing-id'>{t('listing_publication.listing_id_label')}</label>
        <Input
          aria-describedby={manualListingError ? 'manual-listing-id-error' : 'manual-listing-id-help'}
          aria-invalid={manualListingError ? 'true' : 'false'}
          id='manual-listing-id'
          onChange={(_, data) => {
            setManualListingId(data.value);
            if (manualListingError) setManualListingError('');
          }}
          placeholder={t('listing_publication.listing_id_placeholder')}
          ref={inputRef}
          value={manualListingId}
        />
        <p className='publication-note' id='manual-listing-id-help'>
          {t('listing_publication.listing_id_help')}
        </p>
        {manualListingError ? <p className='publication-feedback' data-tone='error' id='manual-listing-id-error'>{manualListingError}</p> : null}
        <div className='manual-listing-actions'>
          <Button appearance='secondary' disabled={disableActions} onClick={(event) => submitManualCommand(event, 'publish')}>{t('listing_publication.publish_by_id')}</Button>
          <Button appearance='secondary' disabled={disableActions} onClick={(event) => submitManualCommand(event, 'withdraw')}>{t('listing_publication.withdraw_by_id')}</Button>
        </div>
        {manualBusy ? <p className='publication-feedback' data-tone='success' role='status'>{t('listing_publication.sending_command')}</p> : null}
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
