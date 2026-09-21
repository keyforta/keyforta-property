import { useEffect, useMemo, useState } from 'react';
import { Button, Spinner } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import i18n from './i18n.js';
import { createApiClient } from '@keyforta/api-client';
import { publicListingPublicationEnvelopeSchema } from '@keyforta/contracts';

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
  // `command` is the stable API wire value (see apps/api/src/app.ts's
  // public-listings command handler); `action` is the translated button
  // label for display only and must never be sent to the API.
  return {
    action: t(`listing_publication.status.${key}.action`),
    command: key === 'published' ? 'withdraw' : 'publish',
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
  feedError,
  feedLoading,
  listings,
  onRetryFeed,
  session,
}) {
  const { t } = useTranslation();
  const resolvedEmptyState = emptyState ?? t('listing_publication.empty_state');
  const [items, setItems] = useState(listings);
  const [busyListingId, setBusyListingId] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('');
  const hasOrganizationContext = Boolean(session?.organizationId);
  const [tokenStatus, setTokenStatus] = useState(session?.sessionMode === 'demo' ? 'demo' : !hasOrganizationContext ? 'organization-unavailable' : session?.getAccessToken ? 'sign-in-required' : 'unavailable');
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



  const disableActions = Boolean(busyListingId) || tokenStatus !== 'ready';

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
      {feedLoading ? (
        <p className='publication-feedback' data-tone='success' role='status'>{t('listing_publication.feed_loading')}</p>
      ) : null}
      {feedError ? (
        <div className='publication-feedback' data-tone='error' role='alert'>
          <p>{t('listing_publication.feed_error')}</p>
          {onRetryFeed ? <Button appearance='secondary' onClick={onRetryFeed}>{t('listing_publication.feed_retry')}</Button> : null}
        </div>
      ) : null}
      {!feedLoading && !feedError && items.length === 0 ? (
        <p className='publication-empty'>{resolvedEmptyState}</p>
      ) : null}
      {!feedLoading && !feedError && items.length > 0 ? (
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
                  onClick={() => runCommand(listing.id, copy.command)}
                >
                  {isBusy ? <><Spinner size='tiny' /> {t('listing_publication.saving')}</> : copy.action}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}
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
