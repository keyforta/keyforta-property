import { createBrowserEntraAuth } from '@keyforta/browser-auth';
import { Badge, Button, Field, Spinner, Textarea } from '@fluentui/react-components';
import { ArrowClockwise20Regular, SignOut20Regular } from '@fluentui/react-icons';
import { AppBrand } from '@keyforta/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
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

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function LoginGate({ auth }) {
  const messages = {
    loading: 'Checking Microsoft Entra sign-in...',
    authenticating: 'Opening Microsoft Entra sign-in...',
    unavailable: 'Microsoft Entra sign-in is not configured for this environment.',
    error: 'Microsoft Entra sign-in could not be completed. Try again.',
  };
  return <div className="auth"><section className="card" aria-labelledby="admin-sign-in-title">
    <AppBrand surface="ADMIN" /><p className="eyebrow">Restricted console</p>
    <h1 id="admin-sign-in-title">Landlord onboarding review</h1>
    <p className="muted">Sign in with a platform administrator identity to review onboarding applications.</p>
    {auth.status === 'signed-out' ? <Button appearance="primary" className="primary" onClick={() => adminAuth.signIn()}>Sign in with Microsoft Entra</Button> :
      <div className={`state-message ${auth.status === 'error' ? 'error' : ''}`} role="status">
        {['loading', 'authenticating'].includes(auth.status) ? <Spinner size="tiny" /> : null}<span>{messages[auth.status]}</span>
      </div>}
  </section></div>;
}

function ReviewCard({ application, busy, onDecision }) {
  const [reason, setReason] = useState(application.decisionReason || '');
  const pending = application.status === 'pending';
  return <article className="application-card">
    <div className="application-heading"><div><p className="eyebrow">{application.proposedOrganizationName}</p><h2>{application.applicantName}</h2></div>
      <Badge appearance="tint" color={pending ? 'warning' : application.status === 'approved' ? 'success' : 'danger'}>{application.status}</Badge></div>
    <dl><div><dt>Submitted</dt><dd>{formatDate(application.submittedAt)}</dd></div>
      {application.decidedAt && <div><dt>Decided</dt><dd>{formatDate(application.decidedAt)}</dd></div>}</dl>
    {pending ? <form onSubmit={(event) => event.preventDefault()}>
      <Field label="Decision reason" hint="Required for both approval and rejection.">
        <Textarea value={reason} onChange={(_, data) => setReason(data.value)} minLength={3} maxLength={1000} resize="vertical" required />
      </Field>
      <div className="decision-actions">
        <Button appearance="primary" disabled={busy || reason.trim().length < 3} onClick={() => onDecision(application.id, 'approved', reason)}>Approve</Button>
        <Button appearance="secondary" disabled={busy || reason.trim().length < 3} onClick={() => onDecision(application.id, 'rejected', reason)}>Reject</Button>
      </div>
    </form> : <div className="decision-evidence"><strong>Decision reason</strong><p>{application.decisionReason}</p></div>}
  </article>;
}

function ReviewQueue({ auth }) {
  const [queue, setQueue] = useState({ status: 'loading', applications: [], message: '' });
  const [busyId, setBusyId] = useState('');
  async function load() {
    setQueue((current) => ({ ...current, status: 'loading', message: '' }));
    try {
      const applications = await onboardingApi.list();
      setQueue({ status: applications.length ? 'ready' : 'empty', applications, message: '' });
    } catch (error) {
      if (error?.status === 404) setQueue({ status: 'denied', applications: [], message: 'This identity is not authorized to review onboarding applications.' });
      else setQueue({ status: 'error', applications: [], message: error?.code === 'API_UNAVAILABLE' ? 'The admin API is not configured.' : 'The review queue could not be loaded.' });
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
      if (error?.status === 404) setQueue({ status: 'denied', applications: [], message: 'This identity is not authorized to decide onboarding applications.' });
      else setQueue((current) => ({ ...current, message: 'The decision could not be completed. Refresh the queue and try again.' }));
    } finally { setBusyId(''); }
  }
  return <div className="admin-shell">
    <header className="admin-header"><AppBrand surface="ADMIN" /><div className="admin-actions">
      <span className="identity">{auth.account.name || auth.account.username}</span>
      <Button icon={<ArrowClockwise20Regular />} appearance="subtle" onClick={load}>Refresh</Button>
      <Button icon={<SignOut20Regular />} appearance="subtle" onClick={() => adminAuth.signOut()}>Sign out</Button>
    </div></header>
    <main className="main"><div className="page-heading"><p className="eyebrow">Platform administration</p><h1>Landlord onboarding review</h1>
      <p className="muted">Approve or reject verified applicants. Every decision requires a reason and is audited by the API.</p></div>
      {queue.message && queue.status !== 'denied' && <div className="state-message error" role="alert">{queue.message}</div>}
      {queue.status === 'loading' && <div className="state-message" role="status"><Spinner size="small" /> Loading applications...</div>}
      {queue.status === 'empty' && <div className="state-message" role="status">No onboarding applications are awaiting review.</div>}
      {queue.status === 'denied' && <div className="denied-state"><h2>Access denied</h2><p>{queue.message}</p></div>}
      {queue.status === 'ready' && <section className="application-list" aria-label="Landlord onboarding applications">
        {queue.applications.map((application) => <ReviewCard key={application.id} application={application} busy={busyId === application.id} onDecision={decide} />)}
      </section>}
    </main>
  </div>;
}

export function OnboardingAdmin() {
  const auth = useSyncExternalStore(adminAuth.subscribe, adminAuth.getSnapshot, adminAuth.getSnapshot);
  useEffect(() => { adminAuth.initialize(); }, []);
  return auth.status === 'signed-in' ? <ReviewQueue auth={auth} /> : <LoginGate auth={auth} />;
}
