import { useEffect, useRef } from 'react';
import { Avatar, Button } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import { ListingPublicationPanel } from '../../listing-publication-panel.jsx';
import { LandlordBrandHeader } from '../landlord/components/BrandHeader.jsx';
import { annotateStatusTone } from '../landlord/statusTone.js';
import { PortfolioStatusLegend } from './components/PortfolioStatusLegend.jsx';

// docs/product/MANAGER_REDESIGN_SPEC.md §8.1(a): `BrandHeader` and the
// tone-annotation helper are imported directly from
// `../landlord/...`, unmodified — no fork, no duplication, no shared
// extraction (that refactor of already-merged Phase 1 code is an
// explicitly deferred open question, §8a/§8.1(a)). `StatusBadge` is
// imported (also unmodified) one level down, inside
// `./components/PortfolioStatusLegend.jsx` — see that file's own comment
// for why it cannot be substituted directly into the reused, protected
// `ListingPublicationPanel` markup.
//
// This shell intentionally has NO next-best-action checklist section
// (§8.1(c): omitted — no PO-approved Manager-specific checklist item set
// exists) and NEVER imports/renders the landlord-only property-management
// capability (§0/§1/§9 of that spec — Manager has no property/unit/
// pricing/availability capability). Both omissions are structural (no
// import exists to remove), not merely unused code paths, so they are
// independently verifiable by grep for that component's exact export name
// anywhere under this directory.
export function ManagerShell({
  active,
  completedAction,
  listingPublicationEmptyState,
  managerListings,
  managerListingsError,
  managerListingsLoading,
  navKeys,
  onComplete,
  onLogout,
  onSetActive,
  onToggleLanguage,
  retryManagerListings,
  role,
  roleActions,
  session,
  showListingPublication,
}) {
  const { t } = useTranslation();
  const activeIndex = navKeys.indexOf(active);
  const activeLabel = activeIndex >= 0 ? role.nav[activeIndex] : role.nav[0];
  const rootRef = useRef(null);

  // Same reused, external annotation approach already shipped for
  // Landlord (statusTone.js, imported unmodified above): the reused,
  // protected `ListingPublicationPanel` renders each listing's status as
  // a plain `<span className='status'>{translatedText}</span>` with no
  // status-specific class/attribute of its own, so a withdrawn listing's
  // badge is annotated with `data-kf-tone='negative'` purely by comparing
  // its own already-rendered text against the one negative status string
  // Manager's surface can ever show — no domain logic is reimplemented,
  // only a presentational read of already-rendered output (see
  // statusTone.js's own comment for the full rationale, which applies
  // identically here).
  useEffect(() => {
    const container = rootRef.current;
    if (!container) return undefined;
    const negativeTexts = new Set([t('listing_publication.status.withdrawn.badge')]);
    annotateStatusTone(container, negativeTexts);
    const observer = new MutationObserver(() => annotateStatusTone(container, negativeTexts));
    observer.observe(container, { characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [t, managerListings, showListingPublication]);

  return (
    <div className='kf-manager-redesign app-shell' ref={rootRef}>
      <aside className='sidebar kf-sidebar'>
        <LandlordBrandHeader tone='reversed' />
        <div className='workspace-label kf-kicker-on-dark'>{role.eyebrow}</div>
        <nav aria-label={t('workspace.navigation_label')}>
          {role.nav.map((label, index) => (
            <Button
              key={navKeys[index]}
              appearance='subtle'
              className={`nav-item kf-nav-item ${navKeys[index] === active ? 'active kf-nav-item-active' : ''}`}
              onClick={() => onSetActive(navKeys[index])}
            >
              {label}
            </Button>
          ))}
        </nav>
        <Button appearance='subtle' className='language-toggle kf-nav-item' onClick={onToggleLanguage}>
          {t('common.switch_language')}
        </Button>
        <Button appearance='subtle' className='signout kf-nav-item' onClick={onLogout}>
          {t('common.sign_out')}
        </Button>
      </aside>
      <main className='main'>
        <header className='topbar kf-topbar'>
          <div>
            <p className='kicker kf-kicker kf-topbar-kicker'>{role.eyebrow}</p>
            <h1 className='kf-display-title'>{active === 'overview' ? role.title : activeLabel}</h1>
            <p className='muted kf-body'>
              {active === 'overview' ? role.summary : t('workspace.records_and_actions', { section: activeLabel.toLowerCase() })}
            </p>
          </div>
          <div className='user-chip kf-user-chip'>
            <Avatar name={session.email} size={32} />
            <span className='kf-body'>{session.email}</span>
          </div>
        </header>
        <section className='stats kf-stats'>
          <p className='muted stats-empty-state kf-empty-card' data-testid='stats-empty-state'>
            {role.statsEmptyState}
          </p>
        </section>
        <section className='content-grid'>
          {showListingPublication ? (
            <div className='kf-grid-full kf-listing-publication-wrap'>
              {active === 'portfolio' ? <PortfolioStatusLegend /> : null}
              <ListingPublicationPanel
                emptyState={listingPublicationEmptyState}
                feedError={managerListingsError}
                feedLoading={managerListingsLoading}
                listings={managerListings}
                onRetryFeed={retryManagerListings}
                session={session}
              />
            </div>
          ) : null}
          <article className='panel table-panel kf-panel'>
            <div className='panel-head'>
              <div>
                <p className='kicker kf-kicker'>{t('workspace.activity')}</p>
                <h2 className='kf-section-heading'>{t('workspace.needs_attention')}</h2>
              </div>
            </div>
            <p className='muted kf-empty-card' data-testid='rows-empty-state'>{role.rowsEmptyState}</p>
          </article>
          <aside className='panel quick-panel kf-panel'>
            <p className='kicker kf-kicker'>{t('workspace.quick_actions')}</p>
            <h2 className='kf-section-heading'>{t('workspace.keep_things_moving')}</h2>
            <div className='quick-actions kf-quick-actions'>
              {roleActions.map((action) => (
                <Button key={action} appearance='outline' className='kf-quick-action' onClick={() => onComplete(action)}>
                  <span className='kf-quick-action-chip'>{action[0]}</span>
                  {completedAction === action ? t('common.saved') : action}
                </Button>
              ))}
            </div>
            <div className='api-note kf-api-note'>
              <strong className='kf-body-strong'>{t('workspace.api_boundary')}</strong>
              <p className='kf-small'>{t('workspace.api_boundary_body')}</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
