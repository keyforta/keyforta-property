import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Avatar,
  Button,
  FluentProvider,
  Spinner,
  webLightTheme,
} from '@fluentui/react-components';
import { createBrowserEntraAuth } from '@keyforta/browser-auth';
import { AppBrand } from '@keyforta/ui';
import './styles.css';
import { ListingPublicationPanel } from './listing-publication-panel.jsx';

// Real Microsoft Entra B2B guest sign-in (issue #77 decision), mirroring
// admin-web's working pattern. Falls back to an 'unavailable' status when
// VITE_ENTRA_* is not configured for this environment.
export const portalAuth = createBrowserEntraAuth({
  apiScope: import.meta.env.VITE_ENTRA_API_SCOPE,
  authority: import.meta.env.VITE_ENTRA_AUTHORITY,
  clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
  redirectUri: '/auth/callback',
});

export const SESSION_KEY = 'keyforta.portal.session';
export const roles = {
  tenant: {
    label: 'Tenant',
    eyebrow: 'My rental',
    title: 'Everything about your home, in one place.',
    summary: 'Track your application, lease, payments, maintenance, documents, and messages.',
    nav: ['Overview', 'My lease', 'Payments', 'Maintenance', 'Documents', 'Messages'],
    statsEmptyState: 'Lease, payment, and maintenance summaries will appear here once the tenant read APIs are available.',
    rowsEmptyState: 'Recent maintenance, payment, and message activity will appear here once the tenant read APIs are available.',
  },
  landlord: {
    label: 'Landlord', eyebrow: 'Owner workspace', title: 'A clear view of your property portfolio.', summary: 'Manage properties, units, applications, leases, rent, maintenance, documents, and your manager relationships.',
    nav: ['Overview', 'Properties', 'Applications', 'Leases', 'Payments', 'Maintenance', 'Documents', 'Messages'],
    statsEmptyState: 'Portfolio, occupancy, and collections summaries will appear here once the landlord read APIs are available.',
    rowsEmptyState: 'Recent applications, payments, and manager invitations will appear here once the landlord read APIs are available.',
  },
  manager: {
    label: 'Property manager', eyebrow: 'Operations workspace', title: 'Coordinate the work behind every home.', summary: 'Operate the assigned portfolio while keeping applications, occupants, payments, maintenance, documents, and communication connected.',
    nav: ['Overview', 'Portfolio', 'Applications', 'Occupancy', 'Payments', 'Work orders', 'Documents', 'Messages'],
    statsEmptyState: 'Assigned units, applications, work orders, and payment summaries will appear here once the manager read APIs are available.',
    rowsEmptyState: 'Recent applications, work orders, and documents will appear here once the manager read APIs are available.',
  },
  operator: {
    label: 'Independent maintenance operator', eyebrow: 'Field workspace', title: 'Move every assigned job forward.', summary: 'Offer your services across properties, then manage only the jobs, access windows, quotes, reports, and evidence assigned to you.',
    nav: ['Overview', 'Service offers', 'Work orders', 'Schedule', 'Quotes', 'Reports', 'Earnings', 'Profile'],
    statsEmptyState: 'Assigned jobs, today\u2019s schedule, quotes, and earnings summaries will appear here once the operator read APIs are available.',
    rowsEmptyState: 'Recent work orders, visits, and quotes will appear here once the operator read APIs are available.',
  },
};
export const actions = {
  tenant: ['Report a maintenance issue', 'Upload a document', 'Message manager'],
  landlord: ['Add a property', 'Invite a manager', 'Review applications'],
  manager: ['Review an application', 'Create work order', 'Record a payment', 'Publish a listing'],
  operator: ['Publish a service offer', 'Accept a work order', 'Submit a quote'],
};

export function readSession() {
  const params = new URLSearchParams(window.location.search);
  const requestedRole = params.get('role');
  if (requestedRole && roles[requestedRole]) {
    const nextSession = { email: params.get('email') || `demo.${requestedRole}@test.keyforta.com`, role: requestedRole, issuedAt: new Date().toISOString(), organizationId: params.get('organizationId') || '3f2504e0-4f89-41d3-9a0c-0305e82c3301', sessionMode: 'demo' };
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    window.history.replaceState({}, '', window.location.pathname);
    return nextSession;
  }

  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (session?.role === 'technician') return { ...session, role: 'operator' };
    return session;
  } catch {
    return null;
  }
}

const authStatusMessages = {
  loading: 'Checking Microsoft Entra sign-in...',
  authenticating: 'Opening Microsoft Entra sign-in...',
  unavailable: 'Microsoft Entra sign-in is not configured for this environment.',
  error: 'Microsoft Entra sign-in could not be completed. Try again.',
};

function LoginGate({ auth }) {
  return (
    <div className='auth-layout'>
      <section className='auth-card'>
        <AppBrand surface='PORTAL' />
        <p className='kicker'>Protected workspace</p>
        <h1>Sign in to continue.</h1>
        <p className='muted'>Sign in with your Microsoft Entra account to open your workspace.</p>
        {auth.status === 'signed-out' ? (
          <Button appearance='primary' className='primary' onClick={() => portalAuth.signIn()}>
            Sign in with Microsoft Entra
          </Button>
        ) : (
          <div className={`state-message ${auth.status === 'error' ? 'error' : ''}`} role='status'>
            {['loading', 'authenticating'].includes(auth.status) ? <Spinner size='tiny' /> : null}
            <span>{authStatusMessages[auth.status]}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function PendingWorkspaceAccess({ auth, onSignOut }) {
  return (
    <div className='auth-layout'>
      <section className='auth-card'>
        <AppBrand surface='PORTAL' />
        <p className='kicker'>Protected workspace</p>
        <h1>Workspace access pending.</h1>
        <p className='muted'>
          Signed in as {auth.account?.email || auth.account?.name || auth.account?.username}. No tenant, landlord,
          manager, or operator workspace is assigned to this identity yet. Contact your
          organization once membership provisioning is available.
        </p>
        <Button appearance='secondary' onClick={onSignOut}>Sign out</Button>
      </section>
    </div>
  );
}

export function Portal() {
  const [session, setSession] = useState(readSession);
  const [active, setActive] = useState('Overview');
  const [completedAction, setCompletedAction] = useState('');
  const [managerListings] = useState([]);
  const auth = useSyncExternalStore(portalAuth.subscribe, portalAuth.getSnapshot, portalAuth.getSnapshot);
  useEffect(() => { portalAuth.initialize(); }, []);
  const roleKey = session && Object.prototype.hasOwnProperty.call(actions, session.role) ? session.role : 'tenant';
  const showListingPublication = roleKey === 'manager' && (active === 'Portfolio' || active === 'Overview');
  const listingPublicationEmptyState = useMemo(() => active === 'Portfolio'
    ? 'No assigned listings are loaded in this prototype yet. Use a trusted listing ID to publish or withdraw while the portfolio feed remains unavailable.'
    : 'Assigned listings will appear here after the portfolio feed is available.', [active]);

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setActive('Overview');
    portalAuth.signOut();
  };
  const complete = (action) => {
    setCompletedAction(action);
    window.setTimeout(() => setCompletedAction(''), 900);
  };

  if (!session) {
    if (auth.status === 'signed-in') {
      return <PendingWorkspaceAccess auth={auth} onSignOut={() => portalAuth.signOut()} />;
    }
    return <LoginGate auth={auth} />;
  }

  const role = roles[roleKey] || roles.tenant;
  return (
    <div className='app-shell'>
      <aside className='sidebar'>
        <AppBrand surface='PORTAL' />
        <div className='workspace-label'>{role.eyebrow}</div>
        <nav aria-label='Workspace navigation'>
          {role.nav.map((item) => (
            <Button key={item} className={`nav-item ${item === active ? 'active' : ''}`} appearance='subtle' onClick={() => setActive(item)}>
              {item}
            </Button>
          ))}
        </nav>
        <Button className='signout' appearance='subtle' onClick={logout}>Sign out</Button>
      </aside>
      <main className='main'>
        <header className='topbar'>
          <div>
            <p className='kicker'>{role.eyebrow}</p>
            <h1>{active === 'Overview' ? role.title : active}</h1>
            <p className='muted'>{active === 'Overview' ? role.summary : `Your ${active.toLowerCase()} records and actions.`}</p>
          </div>
          <div className='user-chip'>
            <Avatar name={session.email} size={32} />
            <span>{session.email}</span>
          </div>
        </header>
        <section className='stats'>
          <p className='muted stats-empty-state' data-testid='stats-empty-state'>{role.statsEmptyState}</p>
        </section>
        <section className='content-grid'>
          {showListingPublication ? <ListingPublicationPanel emptyState={listingPublicationEmptyState} listings={managerListings} session={session} /> : null}
          <article className='panel table-panel'>
            <div className='panel-head'>
              <div><p className='kicker'>Activity</p><h2>Needs your attention</h2></div>
            </div>
            <p className='muted' data-testid='rows-empty-state'>{role.rowsEmptyState}</p>
          </article>
          <aside className='panel quick-panel'>
            <p className='kicker'>Quick actions</p>
            <h2>Keep things moving.</h2>
            <div className='quick-actions'>
              {actions[roleKey].map((action) => (
                <Button key={action} appearance='outline' onClick={() => complete(action)}>
                  <span>{action[0]}</span>
                  {completedAction === action ? 'Saved' : action}
                </Button>
              ))}
            </div>
            <div className='api-note'>
              <strong>API boundary</strong>
              <p>Every action maps to a command or resource in the shared contract. The server remains authoritative.</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

export function PortalApp() {
  return <FluentProvider theme={webLightTheme}><Portal /></FluentProvider>;
}
