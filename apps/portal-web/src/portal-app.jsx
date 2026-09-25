import { Component, lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
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
//
// Copilot PR #134 review, cycle-4 finding #1 (comment 4099022183): the
// flag predicate itself is deliberately NOT imported from
// ./redesign/landlord/ (it lives in the non-redesign ./feature-flags.js
// module instead), so this file's only module-graph edge into the
// redesign directory is the lazy() dynamic import directly below — the
// redesign directory stays entirely behind that lazy import boundary.
import { isLandlordRedesignEnabled } from './feature-flags.js';

const LandlordRedesign = lazy(() => import('./redesign/landlord/index.jsx'));
// Phase 2 (docs/product/MANAGER_REDESIGN_SPEC.md): additive, isolated,
// flag-gated Manager redesign, mirroring the exact Landlord wiring above
// line-for-line. `isLandlordRedesignEnabled` is deliberately reused
// as-is (not duplicated into a second, Manager-only flag predicate) —
// its underlying check (`VITE_REDESIGN_ENABLED` + dev/preview mode) is
// role-agnostic despite its name; the spec's acceptance checklist
// explicitly requires reusing "the same mechanism" rather than inventing
// a second flag (§9).
const ManagerRedesign = lazy(() => import('./redesign/manager/index.jsx'));

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

// Copilot PR #134 review, cycle-6 finding (High): the lazy-loaded
// landlord redesign previously used `<Suspense fallback={null}>`, which
// left the screen blank while the chunk fetch was in flight, and had no
// error boundary at all — a rejected dynamic import (transient
// chunk/network failure) therefore left the portal permanently blank.
// This is a real, visible loading state (mirrors the `role='status'` +
// Fluent `Spinner` pattern already used by `LoginGate` above), shown only
// for the brief window the redesign chunk is being fetched.
function LandlordRedesignLoading() {
  const { t } = useTranslation();
  return (
    <div className='auth-layout'>
      <section className='auth-card'>
        <div className='state-message' role='status'>
          <Spinner size='tiny' />
          <span>{t('workspace.loading_landlord_redesign')}</span>
        </div>
      </section>
    </div>
  );
}

// Catches a rejected dynamic import of the landlord redesign chunk (e.g. a
// transient network/CDN failure) and falls back to rendering the existing,
// unmodified legacy landlord shell (`fallback`) instead of leaving the
// portal blank. The failure is logged (not swallowed) so it stays
// diagnosable.
class LandlordRedesignErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(
      'Landlord redesign chunk failed to load; falling back to the legacy landlord workspace.',
      error,
      info,
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Manager-phase mirror of `LandlordRedesignLoading`/`LandlordRedesignErrorBoundary`
// above (docs/product/MANAGER_REDESIGN_SPEC.md §9's "mirroring the exact
// pattern already proven for the landlord redesign's ... wiring"). Kept as
// its own small class (rather than reusing the landlord one) only so a
// caught chunk-load failure logs an accurate, non-misleading message.
function ManagerRedesignLoading() {
  const { t } = useTranslation();
  return (
    <div className='auth-layout'>
      <section className='auth-card'>
        <div className='state-message' role='status'>
          <Spinner size='tiny' />
          <span>{t('workspace.loading_landlord_redesign')}</span>
        </div>
      </section>
    </div>
  );
}

class ManagerRedesignErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(
      'Manager redesign chunk failed to load; falling back to the legacy manager workspace.',
      error,
      info,
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
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

  // This is the existing, unmodified legacy workspace shell — rendered for
  // every non-landlord role, for landlords when the redesign flag is off,
  // AND (see the error boundary below) as the fallback when the
  // redesign's lazy chunk fails to load, so the portal never goes blank.
  const legacyWorkspace = (
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

  // Single flag-gated mount point for the additive landlord redesign (see
  // ./redesign/landlord/). Every prop below is a value already computed
  // above by the existing hooks/session logic — nothing new is fetched or
  // authorized here.
  //
  // Copilot PR #134 review, cycle-6 finding (High): a rejected dynamic
  // import (transient chunk/network failure) must not leave the portal
  // blank. `LandlordRedesignErrorBoundary` catches that failure, logs it,
  // and falls back to rendering `legacyWorkspace` — the exact same,
  // unmodified shell landlords already see today — so the portal stays
  // usable. The happy path (chunk loads successfully) is unchanged.
  if (roleKey === 'landlord' && isLandlordRedesignEnabled()) {
    return (
      <LandlordRedesignErrorBoundary fallback={legacyWorkspace}>
        <Suspense fallback={<LandlordRedesignLoading />}>
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
      </LandlordRedesignErrorBoundary>
    );
  }
  // Manager-phase mirror of the landlord mount point immediately above
  // (docs/product/MANAGER_REDESIGN_SPEC.md §9). Same reused flag
  // predicate, same error-boundary/Suspense/legacy-fallback shape; only
  // the props actually consumed by `ManagerShell` (no
  // rentalProperties/showPropertyManagement — Manager never renders
  // `PropertyManagementPanel`, §0/§1 of that spec) are passed down.
  if (roleKey === 'manager' && isLandlordRedesignEnabled()) {
    return (
      <ManagerRedesignErrorBoundary fallback={legacyWorkspace}>
        <Suspense fallback={<ManagerRedesignLoading />}>
          <ManagerRedesign
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
            retryManagerListings={retryManagerListings}
            role={role}
            roleActions={roleActions}
            session={session}
            showListingPublication={showListingPublication}
          />
        </Suspense>
      </ManagerRedesignErrorBoundary>
    );
  }
  return legacyWorkspace;
}

export function PortalApp() {
  return <FluentProvider theme={webLightTheme}><Portal /></FluentProvider>;
}
