// AdminShell — the Admin redesign's assembly/layout component
// (docs/product/ADMIN_REDESIGN_SPEC.md §3.2/§4). Mirrors the structural
// role `ManagerShell.jsx`/`TenantShell.jsx` play for their own phases:
// wiring nav, header chrome, and each section's content together into
// one restyled tree — not a new visual pattern.
//
// Unlike Manager/Tenant (same app as Landlord, importable via
// `../landlord/...`), this file cannot import anything from the sibling
// Portal front-end application's own redesign modules at all — separate
// Vite app/workspace, separate build root (spec §1/§2). The only things
// imported across the app boundary are genuinely shared workspace
// packages already used by both apps (`@fluentui/react-components`,
// `@fluentui/react-icons`, `@keyforta/ui`'s `AppBrand`).
//
// `formatDate` and `isSafeImageUrl` are imported directly from
// `../../OnboardingAdmin.jsx` (exported there via the same additive block
// that adds this redesign's mount point — see that file's comment) rather
// than duplicated here. `isSafeImageUrl` in particular must not be
// reimplemented anywhere under this directory (spec §4.3.1/§6/§9 —
// "this safety logic is not touched or reinterpreted by this spec, only
// described"); reusing the exact function, unmodified, is the only way to
// satisfy that requirement for a wholly new component tree. `formatDate`
// is reused for the same reason `theme.js`'s brand ramp is duplicated
// instead (see that file's header comment) — it is trivial, but reusing
// the *exact* existing implementation, rather than a second
// hand-copied one, avoids two independently-maintained date-formatting
// call sites drifting apart.
//
// No next-best-action checklist (spec §3.2/§8b — decided as a clear "no",
// not left open: every actionable item in both queues is already a queue
// row with its own dedicated decision UI). Never imports/renders either
// of the Landlord/Manager-only shared capability panels (which do not
// exist in `apps/admin-web` at all) — see
// test/redesign/admin-scope-boundary.test.js, which intentionally does
// not spell out either panel's name in this file so as not to trip its
// own grep check.
import { useEffect, useState } from 'react';
import { Badge, Button, Field, Spinner, Textarea } from '@fluentui/react-components';
import { ArrowClockwise20Regular, SignOut20Regular } from '@fluentui/react-icons';
import { AppBrand } from '@keyforta/ui';
import { useTranslation } from 'react-i18next';
import { formatDate, isSafeImageUrl } from '../../OnboardingAdmin.jsx';
import { mediaReviewStatusTone, onboardingStatusTone } from './statusTone.js';

function AdminSectionNav({ activeSection, onSectionChange, t }) {
  return (
    <nav aria-label={t('nav.sections_label')} className="kf-admin-nav">
      <Button
        appearance={activeSection === 'onboarding' ? 'primary' : 'subtle'}
        className={`kf-nav-item ${activeSection === 'onboarding' ? 'kf-nav-item-active' : ''}`}
        onClick={() => onSectionChange('onboarding')}
      >
        {t('nav.onboarding')}
      </Button>
      <Button
        appearance={activeSection === 'media-review' ? 'primary' : 'subtle'}
        className={`kf-nav-item ${activeSection === 'media-review' ? 'kf-nav-item-active' : ''}`}
        onClick={() => onSectionChange('media-review')}
      >
        {t('nav.media_review')}
      </Button>
    </nav>
  );
}

function AdminHeader({ activeSection, auth, onLanguageToggle, onRefresh, onSectionChange, onSignOut, t }) {
  return (
    <header className="kf-admin-header">
      <AppBrand surface="ADMIN" />
      <AdminSectionNav activeSection={activeSection} onSectionChange={onSectionChange} t={t} />
      <div className="kf-admin-actions">
        <span className="kf-user-chip">{auth.account.name || auth.account.username}</span>
        <Button appearance="subtle" className="kf-nav-item" onClick={onLanguageToggle}>{t('common.switch_language')}</Button>
        <Button appearance="subtle" className="kf-nav-item" icon={<ArrowClockwise20Regular />} onClick={onRefresh}>{t('common.refresh')}</Button>
        <Button appearance="subtle" className="kf-nav-item" icon={<SignOut20Regular />} onClick={onSignOut}>{t('common.sign_out')}</Button>
      </div>
    </header>
  );
}

function AdminReviewCard({ application, busy, onDecision, t }) {
  const [reason, setReason] = useState(application.decisionReason || '');
  const pending = application.status === 'pending';
  return (
    <article className="kf-decision-card kf-accent-aubergine">
      <div className="kf-card-heading">
        <div>
          <p className="kf-kicker">{application.proposedOrganizationName}</p>
          <h2 className="kf-section-heading">{application.applicantName}</h2>
        </div>
        <Badge appearance="tint" color={onboardingStatusTone(application.status)}>
          {t(`review.status.${application.status}`, { defaultValue: application.status })}
        </Badge>
      </div>
      <dl className="kf-definition-list">
        <div><dt>{t('review.submitted')}</dt><dd>{formatDate(application.submittedAt)}</dd></div>
        {application.decidedAt && <div><dt>{t('review.decided')}</dt><dd>{formatDate(application.decidedAt)}</dd></div>}
      </dl>
      {pending ? (
        <form onSubmit={(event) => event.preventDefault()}>
          <Field hint={t('review.decision_reason_hint')} label={t('review.decision_reason_label')}>
            <Textarea maxLength={1000} minLength={3} onChange={(_, data) => setReason(data.value)} required resize="vertical" value={reason} />
          </Field>
          <div className="kf-decision-actions">
            <Button
              appearance="primary"
              disabled={busy || reason.trim().length < 3}
              onClick={() => onDecision(application.id, 'approved', reason)}
            >
              {t('review.approve')}
            </Button>
            <Button
              appearance="secondary"
              disabled={busy || reason.trim().length < 3}
              onClick={() => onDecision(application.id, 'rejected', reason)}
            >
              {t('review.reject')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="kf-decision-evidence">
          <strong>{t('review.decision_reason_label')}</strong>
          <p>{application.decisionReason}</p>
        </div>
      )}
    </article>
  );
}

function AdminReviewImage({ imageId, listingId, mediaReviewApi, room, t }) {
  const [state, setState] = useState({ objectUrl: '', status: 'loading' });
  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    mediaReviewApi.getReviewImageContent(listingId, imageId).then((url) => {
      if (cancelled) { URL.revokeObjectURL(url); return; }
      objectUrl = url;
      setState({ objectUrl: url, status: 'ready' });
    }).catch(() => {
      if (!cancelled) setState({ objectUrl: '', status: 'error' });
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, listingId, mediaReviewApi]);
  if (state.status === 'loading') {
    return <div className="kf-media-tile kf-media-tile-loading"><Spinner size="tiny" /></div>;
  }
  if (state.status === 'error') {
    return <div className="kf-media-tile kf-media-tile-error">{t('media_review.image_load_failed')}</div>;
  }
  return <img alt={t(`media_review.room.${room}`, { defaultValue: room })} className="kf-media-tile kf-media-tile-image" src={state.objectUrl} />;
}

function AdminMediaReviewCard({ decision, mediaReviewApi, onDecision, review, t }) {
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
  return (
    <article className="kf-decision-card kf-accent-aubergine">
      <div className="kf-card-heading">
        <div>
          <p className="kf-kicker">{review.organizationName}</p>
          <h2 className="kf-section-heading">{review.title || t('media_review.untitled_listing')}</h2>
        </div>
        <Badge appearance="tint" color={mediaReviewStatusTone('pending')}>{t('media_review.status.pending')}</Badge>
      </div>
      <dl className="kf-definition-list">
        <div><dt>{t('media_review.property')}</dt><dd>{review.propertyName}</dd></div>
        <div><dt>{t('media_review.unit')}</dt><dd>{review.unitLabel}</dd></div>
        <div><dt>{t('media_review.submitted')}</dt><dd>{formatDate(review.submittedAt)}</dd></div>
      </dl>
      {review.summary ? <p className="kf-body muted">{review.summary}</p> : null}
      {review.uploadedImages?.length > 0 ? (
        <ul className="kf-media-grid">
          {review.uploadedImages.map((image) => (
            <li key={image.imageId}>
              <AdminReviewImage imageId={image.imageId} listingId={review.listingId} mediaReviewApi={mediaReviewApi} room={image.room} t={t} />
              <span className="kf-media-caption">{t(`media_review.room.${image.room}`, { defaultValue: image.room })}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {review.imageUrls?.length > 0 ? (
        <ul className="kf-legacy-media-list">
          {review.imageUrls.map((url) => (
            <li key={url}>
              {isSafeImageUrl(url) ? (
                <a className="kf-legacy-media-link" href={url} rel="noreferrer" target="_blank">{url}</a>
              ) : (
                <span className="kf-legacy-media-unsafe">{url}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (review.uploadedImages?.length ? null : <p className="kf-body muted">{t('media_review.no_images')}</p>)}
      <form onSubmit={(event) => event.preventDefault()}>
        <Field hint={t('media_review.notes_hint')} label={t('media_review.notes_label')}>
          <Textarea maxLength={2000} onChange={(_, data) => setNotes(data.value)} resize="vertical" value={notes} />
        </Field>
        <div className="kf-decision-actions">
          <Button appearance="primary" disabled={busy || decision !== ''} onClick={() => submit('approved')}>{t('media_review.approve')}</Button>
          <Button appearance="secondary" disabled={busy || decision !== '' || !canReject} onClick={() => submit('rejected')}>{t('media_review.reject')}</Button>
        </div>
      </form>
    </article>
  );
}

function AdminOnboardingQueue({ auth, onLanguageToggle, onSectionChange, onSignOut, onboardingApi, t }) {
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
      setQueue((current) => ({ ...current, applications: current.applications.map((item) => (item.id === updated.id ? updated : item)) }));
    } catch (error) {
      if (error?.status === 404) setQueue({ status: 'denied', applications: [], message: t('review.not_authorized_decide') });
      else setQueue((current) => ({ ...current, message: t('review.decision_failed') }));
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <AdminHeader
        activeSection="onboarding"
        auth={auth}
        onLanguageToggle={onLanguageToggle}
        onRefresh={load}
        onSectionChange={onSectionChange}
        onSignOut={onSignOut}
        t={t}
      />
      <main className="kf-admin-main">
        <div className="kf-page-heading">
          <p className="kf-kicker">{t('review.platform_administration')}</p>
          <h1 className="kf-display-title">{t('review.page_title')}</h1>
          <p className="kf-body muted">{t('review.page_subtitle')}</p>
        </div>
        {queue.message && queue.status !== 'denied' && (
          <div className="kf-state-message kf-state-message-error" role="alert">{queue.message}</div>
        )}
        {queue.status === 'loading' && (
          <div className="kf-state-message" role="status"><Spinner size="small" /> {t('review.loading_applications')}</div>
        )}
        {queue.status === 'empty' && <div className="kf-state-message" role="status">{t('review.empty_state')}</div>}
        {/* Spec §7/§8c: the denied-state block carries no explicit role today
            (neither alert nor status) — an existing inconsistency the spec
            flags rather than silently fixes; preserved as-is here. */}
        {queue.status === 'denied' && (
          <div className="kf-denied-state"><h2>{t('review.access_denied')}</h2><p>{queue.message}</p></div>
        )}
        {queue.status === 'ready' && (
          <section aria-label={t('review.applications_list_label')} className="kf-application-list">
            {queue.applications.map((application) => (
              <AdminReviewCard application={application} busy={busyId === application.id} key={application.id} onDecision={decide} t={t} />
            ))}
          </section>
        )}
      </main>
    </>
  );
}

function AdminMediaReviewQueue({ auth, mediaReviewApi, onLanguageToggle, onSectionChange, onSignOut, t }) {
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
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <AdminHeader
        activeSection="media-review"
        auth={auth}
        onLanguageToggle={onLanguageToggle}
        onRefresh={load}
        onSectionChange={onSectionChange}
        onSignOut={onSignOut}
        t={t}
      />
      <main className="kf-admin-main">
        <div className="kf-page-heading">
          <p className="kf-kicker">{t('review.platform_administration')}</p>
          <h1 className="kf-display-title">{t('media_review.page_title')}</h1>
          <p className="kf-body muted">{t('media_review.page_subtitle')}</p>
        </div>
        {queue.message && queue.status !== 'denied' && (
          <div className="kf-state-message kf-state-message-error" role="alert">{queue.message}</div>
        )}
        {queue.status === 'loading' && (
          <div className="kf-state-message" role="status"><Spinner size="small" /> {t('media_review.loading_reviews')}</div>
        )}
        {queue.status === 'empty' && <div className="kf-state-message" role="status">{t('media_review.empty_state')}</div>}
        {queue.status === 'denied' && (
          <div className="kf-denied-state"><h2>{t('review.access_denied')}</h2><p>{queue.message}</p></div>
        )}
        {queue.status === 'ready' && (
          <section aria-label={t('media_review.list_label')} className="kf-application-list">
            {queue.reviews.map((review) => (
              <AdminMediaReviewCard
                decision={busyId === review.listingId ? busyId : ''}
                key={review.listingId}
                mediaReviewApi={mediaReviewApi}
                onDecision={decide}
                review={review}
                t={t}
              />
            ))}
          </section>
        )}
      </main>
    </>
  );
}

export function AdminShell({ auth, mediaReviewApi, onboardingApi, onSectionChange, onSignOut, section }) {
  const { i18n, t } = useTranslation();
  const toggleLanguage = () => i18n.changeLanguage(i18n.resolvedLanguage === 'en' ? 'fr' : 'en');

  return (
    <div className="kf-admin-redesign">
      {section === 'media-review' ? (
        <AdminMediaReviewQueue
          auth={auth}
          mediaReviewApi={mediaReviewApi}
          onLanguageToggle={toggleLanguage}
          onSectionChange={onSectionChange}
          onSignOut={onSignOut}
          t={t}
        />
      ) : (
        <AdminOnboardingQueue
          auth={auth}
          onLanguageToggle={toggleLanguage}
          onSectionChange={onSectionChange}
          onSignOut={onSignOut}
          onboardingApi={onboardingApi}
          t={t}
        />
      )}
    </div>
  );
}
