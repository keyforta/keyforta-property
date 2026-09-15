import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Badge, Button, FluentProvider, webLightTheme } from '@fluentui/react-components';
import './styles.css';

const SESSION_KEY = 'keyforta.admin.session';
const modules = [
  ['Overview', 'Platform health and queues'],
  ['Users & profiles', 'Identity, roles, and verification'],
  ['Organizations', 'Tenant boundaries and memberships'],
  ['Properties', 'Portfolio and inventory oversight'],
  ['Applications', 'Rental decisions and exceptions'],
  ['Maintenance', 'Work orders and operators'],
  ['Payments', 'Ledger and reconciliation'],
  ['Audit events', 'Immutable platform history'],
];
const metrics = [['Organizations', '12', '2 need review'], ['Active users', '248', 'Across all roles'], ['Open exceptions', '7', '3 high priority'], ['API health', '99.9%', 'Last 24 hours']];
const activity = [['Organization', 'Bandalungwa Homes', 'Verification evidence pending', 'Review'], ['User profile', 'operator@example.test', 'Service area changed', 'Inspect'], ['Audit event', 'Payment reconciliation', 'Batch #RB-1024 completed', 'View']];

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function Admin() {
  const [session, setSession] = useState(readSession);
  const [active, setActive] = useState('Overview');
  const [completed, setCompleted] = useState([]);

  const login = () => {
    const nextSession = { email: 'admin@test.keyforta.com', role: 'platform_admin', issuedAt: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setActive('Overview');
  };
  const complete = (action) => setCompleted((current) => [...new Set([...current, action])]);

  if (!session) {
    return <div className="auth"><section className="card"><div className="brand">KEYFORTA <span>/ ADMIN</span></div><p className="eyebrow">Restricted console</p><h1>Platform administration.</h1><p className="muted">Review platform health, organizations, verification, operations, payments, and audit history.</p><Button appearance="primary" className="primary" onClick={login}>Continue as demo administrator</Button><p className="notice"><strong>Demo mode.</strong> Production will require Microsoft Entra authentication and platform-admin authorization.</p></section></div>;
  }

  const heading = modules.find(([name]) => name === active)?.[1] || active;
  return <div className="admin-shell"><aside className="side"><div className="brand">KEYFORTA <span>/ ADMIN</span></div><p className="eyebrow">Platform controls</p><nav aria-label="Administration modules">{modules.map(([name]) => <Button key={name} className={`nav ${name === active ? 'active' : ''}`} appearance="subtle" onClick={() => setActive(name)}>{name}</Button>)}</nav><Button className="logout" appearance="subtle" onClick={logout}>Sign out</Button></aside><main className="main"><header className="header"><div><p className="eyebrow">{active}</p><h1>{heading}</h1><p className="muted">Server-authorized administrative records and actions.</p></div><Badge appearance="tint" className="admin-chip">Admin · demo</Badge></header><div className="alert"><strong>Audit required.</strong> Every administrative mutation must be authorized, idempotent, versioned, and recorded.</div><section className="metrics">{metrics.map(([label, value, note]) => <div key={label}><span>{label}</span><b>{value}</b><small>{note}</small></div>)}</section><section className="grid"><article className="panel"><div className="panel-head"><div><p className="eyebrow">Queue</p><h2>Recent platform activity</h2></div><Button className="quiet" appearance="subtle" onClick={() => complete('Export')}>{completed.includes('Export') ? 'Done' : 'Export'}</Button></div>{activity.map(([type, name, detail, action]) => <div className="row" key={name}><div><strong>{type}</strong><span>{name}</span></div><p>{detail}</p><Button className="quiet" appearance="subtle" onClick={() => complete(action)}>{completed.includes(action) ? 'Done' : action}</Button></div>)}</article><aside className="panel"><p className="eyebrow">Guardrails</p><h2>System boundaries</h2><ul><li>Organization isolation is server-enforced.</li><li>Operator access is assignment and time bounded.</li><li>Posted financial entries are never edited.</li><li>Documents and evidence use private storage.</li></ul></aside></section></main></div>;
}

createRoot(document.querySelector('#app')).render(<FluentProvider theme={webLightTheme}><Admin /></FluentProvider>);