import { createBrowserEntraAuth } from '@keyforta/browser-auth';
import { Badge, Button, Field, Spinner, Textarea } from '@fluentui/react-components';
import { ArrowClockwise20Regular, SignOut20Regular } from '@fluentui/react-icons';
import { AppBrand } from '@keyforta/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import './i18n.js';
import { createMediaReviewApi } from './media-review-api.js';
import { createOnboardingApi } from './onboarding-api.js';

const adminAuth = createBrowserEntraAuth({
  apiScope: import.meta.env.VITE_ENTRA_API_SCOPE,
  authority: import.meta.env.VITE_ENTRA_AUTHORITY,
  clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
  redirectUri: '/auth/callback',
});
const onboardingApi = createOnboardingApi({
  baseUrl: import.meta.env.VITE_KEYFORTA_API_BASE_URL,
  getAccessToken: () => adminAuth.getAccessToken(),
});
const mediaReviewApi = createMediaReviewApi({
  baseUrl: import.meta.env.VITE_KEYFORTA_API_BASE_URL,
  getAccessToken: () => adminAuth.getAccessToken(),
});

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function LoginGate({ auth }) {
  const { t } = useTranslation();
  return <div className="auth"><section className="card" aria-labelledby="admin-sign-in-title">
    <AppBrand surface="ADMIN" /><p className="eyebrow">{t('auth.restricted_console')}</p>
    <h1 id="admin-sign-in-title">{t('auth.sign_in_title')}</h1>
    <p className="muted">{t('auth.sign_in_subtitle')}</p>
    {auth.status === 'signed-out' ? <Button appearance="primary" className="primary" onClick={() => adminAuth.signIn()}>{t('auth.sign_in_button')}</Button> :
      <div className={`state-message ${auth.status === 'error' ? 'error' : ''}`} role="status">
        {['loading', 'authenticating'].includes(auth.status) ? <Spinner size="tiny" /> : null}<span>{t(`auth.status.${auth.status}`)}</span>
      </div>}
  </section></div>;
}

function ReviewCard({ application, busy, onDecision }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState(application.decisionReason || '');
  const pending = application.status === 'pending';
  return <article className="application-card">
    <div className="application-heading"><div><p className="eyebrow">{application.proposedOrganizationName}</p><h2>{application.applicantName}</h2></div>
      <Badge appearance="tint" color={pending ? 'warning' : application.status === 'approved' ? 'success' : 'danger'}>{t(`review.status.${application.status}`, { defaultValue: application.status })}</Badge></div>
    <dl><div><dt>{t('review.submitted')}</dt><dd>{formatDate(application.submittedAt)}</dd></div>
      {application.decidedAt && <div><dt>{t('review.decided')}</dt><dd>{formatDate(application.decidedAt)}</dd></div>}</dl>
    {pending ? <form onSubmit={(event) => event.preventDefault()}>
      <Field label={t('review.decision_reason_label')} hint={t('review.decision_reason_hint')}>
        <Textarea value={reason} onChange={(_, data) => setReason(data.value)} minLength={3} maxLength={1000} resize="vertical" required />
      </Field>
      <div className="decision-actions">
        <Button appearance="primary" disabled={busy || reason.trim().length < 3} onClick={() => onDecision(application.id, 'approved', reason)}>{t('review.approve')}</Button>
        <Button appearance="secondary" disabled={busy || reason.trim().length < 3} onClick={() => onDecision(application.id, 'rejected', reason)}>{t('review.reject')}</Button>
      </div>
    </form> : <div className="decision-evidence"><strong>{t('review.decision_reason_label')}</strong><p>{application.decisionReason}</p></div>}
  </article>;
}

function SectionNav({ activeSection, onSectionChange, t }) {
  return (
    <nav className="admin-nav" aria-label={t('nav.sections_label')}>
      <Button
        appearance={activeSection === 'onboarding' ? 'primary' : 'subtle'}
        onClick={() => onSectionChange('onboarding')}
      >
        {t('nav.onboarding')}
      </Button>
      <Button
        appearance={activeSection === 'media-review' ? 'primary' : 'subtle'}
        onClick={() => onSectionChange('media-review')}
      >
        {t('nav.media_review')}
      </Button>
    </nav>
  );
}

function ReviewQueue({ auth, onSectionChange }) {
  const { t, i18n } = useTranslation();
  const [queue, setQueue] = useState({ status: 'loading', applications: [], message: '' });
  const [busyId, setBusyId] = useState('');
  async function load() {
    setQueue((current) => ({ ...current, status: 'loading', message: '' }));
    try {
      const applications = await onboardingApi.list();
      setQueue({ status: applications.length ? 'ready' : 'empty', applications, message: '' });
    } catch (error) {
      if (error?.status === 404) setQueue({ status: 'denied', applications: [], message: t('review.not_authorized_review') });
      else setQueue({ status: 'error', applications: [], message: error?.code === 'API_UNAVAILABLE' ? t('review.api_unavailable') : t('review.queue_load_failed') });
    }
  }
  useEffect(() => { load(); }, []);
  async function decide(applicationId, decision, reason) {
    setBusyId(applicationId);
    setQueue((current) => ({ ...current, message: '' }));
    try {
      const updated = await onboardingApi.decide(applicationId, { decision, reason });
      setQueue((current) => ({ ...current, applications: current.applications.map((item) => item.id === updated.id ? updated : item) }));
    } catch (error) {
      if (error?.status === 404) setQueue({ status: 'denied', applications: [], message: t('review.not_authorized_decide') });
      else setQueue((current) => ({ ...current, message: t('review.decision_failed') }));
    } finally { setBusyId(''); }
  }
  return <div className="admin-shell">
    <header className="admin-header"><AppBrand surface="ADMIN" />
      <SectionNav activeSection="onboarding" onSectionChange={onSectionChange} t={t} />
      <div className="admin-actions">
      <span className="identity">{auth.account.name || auth.account.username}</span>
      <Button appearance="subtle" onClick={() => i18n.changeLanguage(i18n.resolvedLanguage === 'en' ? 'fr' : 'en')}>{t('common.switch_language')}</Button>
      <Button icon={<ArrowClockwise20Regular />} appearance="subtle" onClick={load}>{t('common.refresh')}</Button>
      <Button icon={<SignOut20Regular />} appearance="subtle" onClick={() => adminAuth.signOut()}>{t('common.sign_out')}</Button>
    </div></header>
    <main className="main"><div className="page-heading"><p className="eyebrow">{t('review.platform_administration')}</p><h1>{t('review.page_title')}</h1>
      <p className="muted">{t('review.page_subtitle')}</p></div>
      {queue.message && queue.status !== 'denied' && <div className="state-message error" role="alert">{queue.message}</div>}
      {queue.status === 'loading' && <div className="state-message" role="status"><Spinner size="small" /> {t('review.loading_applications')}</div>}
      {queue.status === 'empty' && <div className="state-message" role="status">{t('review.empty_state')}</div>}
      {queue.status === 'denied' && <div className="denied-state"><h2>{t('review.access_denied')}</h2><p>{queue.message}</p></div>}
      {queue.status === 'ready' && <section className="application-list" aria-label={t('review.applications_list_label')}>
        {queue.applications.map((application) => <ReviewCard key={application.id} application={application} busy={busyId === application.id} onDecision={decide} />)}
      </section>}
    </main>
  </div>;
}

function MediaReviewCard({ decision, onDecision, review }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState('');
  const [pendingDecision, setPendingDecision] = useState('');
  const busy = pendingDecision !== '';
  const canReject = notes.trim().length > 0;
  async function submit(nextDecision) {
    setPendingDecision(nextDecision);
    try {
      await onDecision(review.listingId, nextDecision, notes.trim() || undefined);
    } finally {
      setPendingDecision('');
    }
  }
  return <article className="application-card">
    <div className="application-heading"><div><p className="eyebrow">{review.organizationName}</p><h2>{review.title || t('media_review.untitled_listing')}</h2></div>
      <Badge appearance="tint" color="warning">{t('media_review.status.pending')}</Badge></div>
    <dl>
      <div><dt>{t('media_review.property')}</dt><dd>{review.propertyName}</dd></div>
      <div><dt>{t('media_review.unit')}</dt><dd>{review.unitLabel}</dd></div>
      <div><dt>{t('media_review.submitted')}</dt><dd>{formatDate(review.submittedAt)}</dd></div>
    </dl>
    {review.summary ? <p className="muted">{review.summary}</p> : null}
    {review.imageUrls.length > 0 ? <ul className="media-review-images">
      {review.imageUrls.map((url) => <li key={url}><a href={url} rel="noreferrer" target="_blank">{url}</a></li>)}
    </ul> : <p className="muted">{t('media_review.no_images')}</p>}
    <form onSubmit={(event) => event.preventDefault()}>
      <Field label={t('media_review.notes_label')} hint={t('media_review.notes_hint')}>
        <Textarea value={notes} onChange={(_, data) => setNotes(data.value)} maxLength={2000} resize="vertical" />
      </Field>
      <div className="decision-actions">
        <Button appearance="primary" disabled={busy || decision !== ''} onClick={() => submit('approved')}>{t('media_review.approve')}</Button>
        <Button appearance="secondary" disabled={busy || decision !== '' || !canReject} onClick={() => submit('rejected')}>{t('media_review.reject')}</Button>
      </div>
    </form>
  </article>;
}

function MediaReviewQueue({ auth, onSectionChange }) {
  const { t, i18n } = useTranslation();
  const [queue, setQueue] = useState({ status: 'loading', reviews: [], message: '' });
  const [busyId, setBusyId] = useState('');
  async function load() {
    setQueue((current) => ({ ...current, status: 'loading', message: '' }));
    try {
      const reviews = await mediaReviewApi.list();
      setQueue({ status: reviews.length ? 'ready' : 'empty', reviews, message: '' });
    } catch (error) {
      if (error?.status === 404) setQueue({ status: 'denied', reviews: [], message: t('media_review.not_authorized_review') });
      else setQueue({ status: 'error', reviews: [], message: error?.code === 'API_UNAVAILABLE' ? t('review.api_unavailable') : t('media_review.queue_load_failed') });
    }
  }
  useEffect(() => { load(); }, []);
  async function decide(listingId, decision, notes) {
    setBusyId(listingId);
    setQueue((current) => ({ ...current, message: '' }));
    try {
      await mediaReviewApi.decide(listingId, { decision, notes });
      setQueue((current) => {
        const reviews = current.reviews.filter((item) => item.listingId !== listingId);
        return { ...current, reviews, status: reviews.length ? 'ready' : 'empty' };
      });
    } catch (error) {
      if (error?.status === 404) setQueue({ status: 'denied', reviews: [], message: t('media_review.not_authorized_decide') });
      else setQueue((current) => ({ ...current, message: t('media_review.decision_failed') }));
    } finally { setBusyId(''); }
  }
  return <div className="admin-shell">
    <header className="admin-header"><AppBrand surface="ADMIN" />
      <SectionNav activeSection="media-review" onSectionChange={onSectionChange} t={t} />
      <div className="admin-actions">
      <span className="identity">{auth.account.name || auth.account.username}</span>
      <Button appearance="subtle" onClick={() => i18n.changeLanguage(i18n.resolvedLanguage === 'en' ? 'fr' : 'en')}>{t('common.switch_language')}</Button>
      <Button icon={<ArrowClockwise20Regular />} appearance="subtle" onClick={load}>{t('common.refresh')}</Button>
      <Button icon={<SignOut20Regular />} appearance="subtle" onClick={() => adminAuth.signOut()}>{t('common.sign_out')}</Button>
    </div></header>
    <main className="main"><div className="page-heading"><p className="eyebrow">{t('review.platform_administration')}</p><h1>{t('media_review.page_title')}</h1>
      <p className="muted">{t('media_review.page_subtitle')}</p></div>
      {queue.message && queue.status !== 'denied' && <div className="state-message error" role="alert">{queue.message}</div>}
      {queue.status === 'loading' && <div className="state-message" role="status"><Spinner size="small" /> {t('media_review.loading_reviews')}</div>}
      {queue.status === 'empty' && <div className="state-message" role="status">{t('media_review.empty_state')}</div>}
      {queue.status === 'denied' && <div className="denied-state"><h2>{t('review.access_denied')}</h2><p>{queue.message}</p></div>}
      {queue.status === 'ready' && <section className="application-list" aria-label={t('media_review.list_label')}>
        {queue.reviews.map((review) => <MediaReviewCard key={review.listingId} decision={busyId === review.listingId ? busyId : ''} onDecision={decide} review={review} />)}
      </section>}
    </main>
  </div>;
}

export function OnboardingAdmin() {
  const auth = useSyncExternalStore(adminAuth.subscribe, adminAuth.getSnapshot, adminAuth.getSnapshot);
  const [section, setSection] = useState('onboarding');
  useEffect(() => { adminAuth.initialize(); }, []);
  if (auth.status === 'signed-in') return section === 'media-review'
    ? <MediaReviewQueue auth={auth} onSectionChange={setSection} />
    : <ReviewQueue auth={auth} onSectionChange={setSection} />;
  return <LoginGate auth={auth} />;
}
