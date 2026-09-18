import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  FluentProvider,
  webLightTheme,
} from '@fluentui/react-components';
import { AppBrand, MetricCard } from '@keyforta/ui';
import './styles.css';

export const SESSION_KEY = 'keyforta.portal.session';
export const roles = {
  tenant: {
    label: 'Tenant',
    eyebrow: 'My rental',
    title: 'Everything about your home, in one place.',
    summary: 'Track your application, lease, payments, maintenance, documents, and messages.',
    nav: ['Overview', 'My lease', 'Payments', 'Maintenance', 'Documents', 'Messages'],
    stats: [['Next rent', '$400', 'Due in 8 days'], ['Lease', 'Active', 'Riverside apartment'], ['Open request', '1', 'Water pump inspection']],
    rows: [['Maintenance request', 'Water pump inspection', 'In progress', 'Maintenance'], ['Payment', 'May rent · receipt #KF-1042', 'Recorded', 'Payments'], ['Message', 'Manager replied about your viewing', 'New', 'Messages']],
  },
  landlord: {
    label: 'Landlord', eyebrow: 'Owner workspace', title: 'A clear view of your property portfolio.', summary: 'Manage properties, units, applications, leases, rent, maintenance, documents, and your manager relationships.',
    nav: ['Overview', 'Properties', 'Applications', 'Leases', 'Payments', 'Maintenance', 'Documents', 'Messages'],
    stats: [['Properties', '3', 'Kinshasa portfolio'], ['Occupancy', '83%', '5 of 6 units'], ['Collected', '$1,850', 'This month'], ['Open maintenance', '2', 'Needs attention']],
    rows: [['Rental application', 'Riverside apartment · Amina K.', 'Awaiting review', 'Applications'], ['Payment', 'May rent · 5 occupied units', 'Reconciled', 'Payments'], ['Manager invitation', 'Patrick M. · Property manager', 'Pending acceptance', 'Messages']],
  },
  manager: {
    label: 'Property manager', eyebrow: 'Operations workspace', title: 'Coordinate the work behind every home.', summary: 'Operate the assigned portfolio while keeping applications, occupants, payments, maintenance, documents, and communication connected.',
    nav: ['Overview', 'Portfolio', 'Applications', 'Occupancy', 'Payments', 'Work orders', 'Documents', 'Messages'],
    stats: [['Assigned units', '14', 'Across 4 properties'], ['Applications', '3', 'Waiting for review'], ['Open work orders', '4', 'Across 3 properties'], ['Payments', '5', 'To reconcile']],
    rows: [['Application', 'Amina K. · Riverside apartment', 'Review required', 'Applications'], ['Work order', 'Generator maintenance · Gombe', 'Assigned', 'Work orders'], ['Document', 'Ownership evidence · Limete', 'Needs review', 'Documents']],
  },
  operator: {
    label: 'Independent maintenance operator', eyebrow: 'Field workspace', title: 'Move every assigned job forward.', summary: 'Offer your services across properties, then manage only the jobs, access windows, quotes, reports, and evidence assigned to you.',
    nav: ['Overview', 'Service offers', 'Work orders', 'Schedule', 'Quotes', 'Reports', 'Earnings', 'Profile'],
    stats: [['Assigned jobs', '3', 'Across 2 properties'], ['Today', '2 visits', 'One confirmed'], ['Quotes', '1', 'Due before 17:00'], ['Earnings', '$1,240', 'This month']],
    rows: [['Work order', 'Water pump inspection · Ngaliema', 'Assigned', 'Work orders'], ['Visit', 'Generator maintenance · Gombe', 'Today, 14:00–15:00', 'Schedule'], ['Quote', 'Pump materials and labor', 'Draft', 'Quotes']],
  },
};
export const actions = {
  tenant: ['Report a maintenance issue', 'Upload a document', 'Message manager'],
  landlord: ['Add a property', 'Invite a manager', 'Review applications'],
  manager: ['Review an application', 'Create work order', 'Record a payment'],
  operator: ['Publish a service offer', 'Accept a work order', 'Submit a quote'],
};

export function readSession() {
  const params = new URLSearchParams(window.location.search);
  const requestedRole = params.get('role');
  if (requestedRole && roles[requestedRole]) {
    const nextSession = { email: params.get('email') || `demo.${requestedRole}@test.keyforta.com`, role: requestedRole, issuedAt: new Date().toISOString() };
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

export function Portal() {
  const [session, setSession] = useState(readSession);
  const [active, setActive] = useState('Overview');
  const [completedAction, setCompletedAction] = useState('');

  const login = (role) => {
    const nextSession = { email: `demo.${role}@test.keyforta.com`, role, issuedAt: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setActive('Overview');
  };
  const complete = (action) => {
    setCompletedAction(action);
    window.setTimeout(() => setCompletedAction(''), 900);
  };

  if (!session) {
    return (
      <div className='auth-layout'>
        <section className='auth-card'>
          <AppBrand surface='PORTAL' />
          <p className='kicker'>Protected workspace</p>
          <h1>Sign in to continue.</h1>
          <p className='muted'>Choose the workspace that matches your role.</p>
          <div className='demo-grid'>
            {Object.entries(roles).map(([value, role]) => (
              <Button key={value} className='demo-choice' appearance='outline' onClick={() => login(value)}>
                <span>{role.label}</span>
                <small>{role.summary}</small>
              </Button>
            ))}
          </div>
          <p className='notice'>No password is required on the development server.</p>
        </section>
      </div>
    );
  }

  const role = roles[session.role] || roles.tenant;
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
          {role.stats.map(([label, value, note]) => (
            <MetricCard key={label} className='stat' label={label} value={value} note={note} />
          ))}
        </section>
        <section className='content-grid'>
          <article className='panel table-panel'>
            <div className='panel-head'>
              <div><p className='kicker'>Activity</p><h2>Needs your attention</h2></div>
              <Button className='quiet' appearance='subtle' onClick={() => complete('New action')}>{completedAction === 'New action' ? 'Saved' : 'New action'}</Button>
            </div>
            <div className='rows'>
              {role.rows.map(([type, title, status, destination]) => (
                <Button key={title} className='record-row' appearance='transparent' onClick={() => setActive(destination)}>
                  <span className='record-type'>{type}</span>
                  <span className='record-copy'><strong>{title}</strong><small>{destination}</small></span>
                  <Badge appearance='tint' className='status'>{status}</Badge>
                  <span className='chevron'>›</span>
                </Button>
              ))}
            </div>
          </article>
          <aside className='panel quick-panel'>
            <p className='kicker'>Quick actions</p>
            <h2>Keep things moving.</h2>
            <div className='quick-actions'>
              {actions[session.role].map((action) => (
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

export const portalEntrySourceMarker = `FluentProvider tenant: { landlord: { manager: { operator: { new URLSearchParams(window.location.search)`;
