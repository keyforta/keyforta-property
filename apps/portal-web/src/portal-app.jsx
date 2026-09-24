import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import {
  Avatar,
  Button,
  FluentProvider,
  Spinner,
  webLightTheme,
} from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import { createBrowserEntraAuth } from '@keyforta/browser-auth';
import { AppBrand } from '@keyforta/ui';
import './i18n.js';
import './styles.css';
import { ListingPublicationPanel } from './listing-publication-panel.jsx';
import { PropertyManagementPanel } from './property-management-panel.jsx';
import { useMembership } from './hooks/use-membership.js';
import { useManagerListings } from './hooks/use-manager-listings.js';
import { useRentalProperties } from './hooks/use-rental-properties.js';
// Flag-gated landlord redesign (docs/product/LANDLORD_REDESIGN_SPEC.md);
// isolated, additive, code-split so it is never fetched unless the flag is
// on (see docs/engineering/REQUIREMENTS_GAPS.md, "Redesigned per-role
// UI/UX with KEYFORTA branding"). This is the only mount point touched in
// this existing file — everything else lives under ./redesign/landlord/.
import { isLandlordRedesignEnabled } from './redesign/landlord/flags.js';

const LandlordRedesign = lazy(() => import('./redesign/landlord/index.jsx'));

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
// Language-independent role identifiers (translated labels/copy live in
// src/locales/*.json under `roles.<key>` and `actions.<key>`).
export const roleKeys = ['tenant', 'landlord', 'manager', 'operator'];
// Language-independent navigation-item identifiers, index-aligned with each
// role's translated `roles.<role>.nav` label array. Keeping these stable
// (rather than comparing against the displayed, translated label) means the
// active-section state does not break when the UI language changes.
const roleNavKeys = {
  tenant: ['overview', 'lease', 'payments', 'maintenance', 'documents', 'messages'],
  landlord: ['overview', 'properties', 'applications', 'leases', 'payments', 'maintenance', 'documents', 'messages'],
  manager: ['overview', 'portfolio', 'applications', 'occupancy', 'payments', 'workOrders', 'documents', 'messages'],
  operator: ['overview', 'serviceOffers', 'workOrders', 'schedule', 'quotes', 'reports', 'earnings', 'profile'],
};

export function readSession() {
  // The `?role=`/persisted-demo-session path exists only for local QA of the
  // role-specific dashboards (see README "Known limitation"); it must never
  // be reachable in a deployed build, since it bypasses the Entra sign-in
  // gate below.
  if (!import.meta.env.DEV) return null;

  const params = new URLSearchParams(window.location.search);
  const requestedRole = params.get('role');
  if (requestedRole && roleKeys.includes(requestedRole)) {
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

function LoginGate({ auth }) {
  const { t } = useTranslation();
  return (
    <div className='auth-layout'>
      <section className='auth-card'>
        <AppBrand surface='PORTAL' />
        <p className='kicker'>{t('auth.protected_workspace')}</p>
        <h1>{t('auth.sign_in_title')}</h1>
        <p className='muted'>{t('auth.sign_in_subtitle')}</p>
        {auth.status === 'signed-out' ? (
          <Button appearance='primary' className='primary' onClick={() => portalAuth.signIn()}>
            {t('auth.sign_in_button')}
          </Button>
        ) : (
          <div className={`state-message ${auth.status === 'error' ? 'error' : ''}`} role='status'>
            {['loading', 'authenticating'].includes(auth.status) ? <Spinner size='tiny' /> : null}
            <span>{t(`auth.status.${auth.status}`)}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function PendingWorkspaceAccess({ auth, onSignOut }) {
  const { t } = useTranslation();
  return (
    <div className='auth-layout'>
      <section className='auth-card'>
        <AppBrand surface='PORTAL' />
        <p className='kicker'>{t('auth.protected_workspace')}</p>
        <h1>{t('auth.pending_title')}</h1>
        <p className='muted'>
          {t('auth.pending_body', { identity: auth.account?.email || auth.account?.name || auth.account?.username })}
        </p>
        <Button appearance='secondary' onClick={onSignOut}>{t('common.sign_out')}</Button>
      </section>
    </div>
  );
}

// Maps `app.organization_role` (server enum) to the portal's UI role keys.
// 'auditor' has no dedicated portal workspace yet, so it intentionally falls
// through to the pending-access state rather than a fabricated role.
const membershipRoleToRoleKey = {
  landlord: 'landlord',
  manager: 'manager',
  tenant: 'tenant',
};

export function Portal() {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState(readSession);
  const [active, setActive] = useState('overview');
  const [completedAction, setCompletedAction] = useState('');
  const auth = useSyncExternalStore(portalAuth.subscribe, portalAuth.getSnapshot, portalAuth.getSnapshot);
  useEffect(() => { portalAuth.initialize(); }, []);
  const membership = useMembership(auth, portalAuth);
  const {
    listings: managerListings,
    loading: managerListingsLoading,
    error: managerListingsError,
    retry: retryManagerListings,
  } = useManagerListings(session);
  const {
    properties: rentalProperties,
    loading: rentalPropertiesLoading,
    error: rentalPropertiesError,
    retry: retryRentalProperties,
  } = useRentalProperties(session);

  // Once a real Entra sign-in resolves to at least one active membership,
  // build a real (non-demo) session for the first matching organization.
  // TODO: support explicit multi-organization selection; today the first
  // resolved membership is used, matching current onboarding (one org).
  useEffect(() => {
    if (session || auth.status !== 'signed-in') return;
    const resolved = membership.memberships?.[0];
    if (!resolved) return;
    const roleKey = membershipRoleToRoleKey[resolved.role];
    if (!roleKey) return;
    setSession({
      email: auth.account?.email || auth.account?.username || auth.account?.name || '',
      role: roleKey,
      organizationId: resolved.organizationId,
      issuedAt: new Date().toISOString(),
      getAccessToken: () => portalAuth.getAccessToken(),
      getAccessTokenSilent: () => portalAuth.getAccessTokenSilent(),
      signIn: () => portalAuth.signIn(),
    });
  }, [auth.account, auth.status, membership.memberships, session]);

  const roleKey = session && roleKeys.includes(session.role) ? session.role : 'tenant';
  // A landlord who directly owns a property (no delegated manager) is
  // already auto-assigned as its manager (migration 0031), and
  // app.set_public_listing_publication authorizes withdraw/publish by that
  // assignment, not by the 'manager' role string, so landlords need this
  // panel too (see docs/engineering/REQUIREMENTS_GAPS.md).
  const showListingPublication = (roleKey === 'manager' && (active === 'portfolio' || active === 'overview'))
    || (roleKey === 'landlord' && (active === 'properties' || active === 'overview'));
  const listingPublicationEmptyState = active === 'portfolio' || active === 'properties'
    ? t('listing_publication.empty_state_portfolio')
    : t('listing_publication.empty_state');
  // Landlords are the only actors authorized to create a Property
  // (app.actor_is_active_landlord, migration 0028); issue #116 identified
  // that no portal UI existed to call this already-approved/implemented API.
  const showPropertyManagement = roleKey === 'landlord' && (active === 'properties' || active === 'overview');

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.resolvedLanguage === 'en' ? 'fr' : 'en');
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setActive('overview');
    portalAuth.signOut();
  };
  const complete = (action) => {
    setCompletedAction(action);
    window.setTimeout(() => setCompletedAction(''), 900);
  };

  if (!session) {
    if (auth.status === 'signed-in') {
      // An empty (or still-loading) membership lookup is the correct,
      // honest state for an identity truly without workspace access — it
      // must not fabricate a session (see README "Known limitation").
      return <PendingWorkspaceAccess auth={auth} onSignOut={() => portalAuth.signOut()} />;
    }
    return <LoginGate auth={auth} />;
  }

  const navKeys = roleNavKeys[roleKey] || roleNavKeys.tenant;
  const role = {
    eyebrow: t(`roles.${roleKey}.eyebrow`),
    title: t(`roles.${roleKey}.title`),
    summary: t(`roles.${roleKey}.summary`),
    nav: t(`roles.${roleKey}.nav`, { returnObjects: true }),
    statsEmptyState: t(`roles.${roleKey}.stats_empty_state`),
    rowsEmptyState: t(`roles.${roleKey}.rows_empty_state`),
  };
  const activeIndex = navKeys.indexOf(active);
  const activeLabel = activeIndex >= 0 ? role.nav[activeIndex] : role.nav[0];
  const roleActions = t(`actions.${roleKey}`, { returnObjects: true });

  // Single flag-gated mount point for the additive landlord redesign (see
  // ./redesign/landlord/). Every prop below is a value already computed
  // above by the existing hooks/session logic — nothing new is fetched or
  // authorized here.
  if (roleKey === 'landlord' && isLandlordRedesignEnabled()) {
    return (
      <Suspense fallback={null}>
        <LandlordRedesign
          active={active}
          completedAction={completedAction}
          listingPublicationEmptyState={listingPublicationEmptyState}
          managerListings={managerListings}
          managerListingsError={managerListingsError}
          managerListingsLoading={managerListingsLoading}
          navKeys={navKeys}
          onComplete={complete}
          onLogout={logout}
          onSetActive={setActive}
          onToggleLanguage={toggleLanguage}
          rentalProperties={rentalProperties}
          rentalPropertiesError={rentalPropertiesError}
          rentalPropertiesLoading={rentalPropertiesLoading}
          retryManagerListings={retryManagerListings}
          retryRentalProperties={retryRentalProperties}
          role={role}
          roleActions={roleActions}
          session={session}
          showListingPublication={showListingPublication}
          showPropertyManagement={showPropertyManagement}
        />
      </Suspense>
    );
  }
  return (
    <div className='app-shell'>
      <aside className='sidebar'>
        <AppBrand surface='PORTAL' />
        <div className='workspace-label'>{role.eyebrow}</div>
        <nav aria-label={t('workspace.navigation_label')}>
          {role.nav.map((label, index) => (
            <Button key={navKeys[index]} className={`nav-item ${navKeys[index] === active ? 'active' : ''}`} appearance='subtle' onClick={() => setActive(navKeys[index])}>
              {label}
            </Button>
          ))}
        </nav>
        <Button className='language-toggle' appearance='subtle' onClick={toggleLanguage}>{t('common.switch_language')}</Button>
        <Button className='signout' appearance='subtle' onClick={logout}>{t('common.sign_out')}</Button>
      </aside>
      <main className='main'>
        <header className='topbar'>
          <div>
            <p className='kicker'>{role.eyebrow}</p>
            <h1>{active === 'overview' ? role.title : activeLabel}</h1>
            <p className='muted'>{active === 'overview' ? role.summary : t('workspace.records_and_actions', { section: activeLabel.toLowerCase() })}</p>
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
          {showListingPublication ? (
            <ListingPublicationPanel
              emptyState={listingPublicationEmptyState}
              feedError={managerListingsError}
              feedLoading={managerListingsLoading}
              listings={managerListings}
              onRetryFeed={retryManagerListings}
              session={session}
            />
          ) : null}
          {showPropertyManagement ? (
            <PropertyManagementPanel
              feedError={rentalPropertiesError}
              feedLoading={rentalPropertiesLoading}
              listings={managerListings}
              onRetryFeed={retryRentalProperties}
              onRetryListingsFeed={retryManagerListings}
              properties={rentalProperties}
              session={session}
            />
          ) : null}
          <article className='panel table-panel'>
            <div className='panel-head'>
              <div><p className='kicker'>{t('workspace.activity')}</p><h2>{t('workspace.needs_attention')}</h2></div>
            </div>
            <p className='muted' data-testid='rows-empty-state'>{role.rowsEmptyState}</p>
          </article>
          <aside className='panel quick-panel'>
            <p className='kicker'>{t('workspace.quick_actions')}</p>
            <h2>{t('workspace.keep_things_moving')}</h2>
            <div className='quick-actions'>
              {roleActions.map((action) => (
                <Button key={action} appearance='outline' onClick={() => complete(action)}>
                  <span>{action[0]}</span>
                  {completedAction === action ? t('common.saved') : action}
                </Button>
              ))}
            </div>
            <div className='api-note'>
              <strong>{t('workspace.api_boundary')}</strong>
              <p>{t('workspace.api_boundary_body')}</p>
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
