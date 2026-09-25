import { Avatar, Button } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import { LandlordBrandHeader } from '../landlord/components/BrandHeader.jsx';

// docs/product/TENANT_REDESIGN_SPEC.md §3.1/§8.1(a): `BrandHeader` is
// imported directly from `../landlord/...`, unmodified — no fork, no
// duplication, no shared extraction (that refactor of already-merged
// Phase 1/2 code is an explicitly deferred open question, spec §8a,
// carried forward unchanged from Manager's identical §8.1(a) note). The
// Fluent theme is imported the same way, one level up, in `./index.jsx`.
//
// This shell intentionally has NO next-best-action checklist section
// (spec §8c/§4.2 item 3 — Tenant has zero actionable, state-changing
// commands to build even one checklist item around; omitted, not built
// speculatively) and NEVER imports/renders the two shared, protected
// listing/property capability panels used by Manager/Landlord (spec
// §0/§1/§9 — Tenant is authorized for neither, and
// `showListingPublication`/`showPropertyManagement` never evaluate true
// for `roleKey === 'tenant'` in `portal-app.jsx`). Both omissions are
// structural (no import exists to remove), independently verifiable by
// grep for either component's exact export name anywhere under this
// directory — see `test/redesign/tenant-scope-boundary.test.js` (which,
// unlike this comment, intentionally does not spell out either name so
// as not to trip its own grep check).
//
// Content-grid layout: spec §4.2 item 2 / §8d explicitly leaves open
// whether Tenant's Overview (and, by the same generic-empty-state rule
// applied uniformly per spec §4.3-§4.8, every one of its six tabs) should
// keep the existing two-column desktop grid (Option A) or collapse to a
// single-column stack (Option B), since Tenant's left column is never
// anything but the shared "Needs attention" empty-state card. This is a
// genuine open product/UX question this spec does not resolve (§8d), not
// re-decided here. Per the task's engineering-default discipline (not a
// silent product-requirement override): this implementation keeps the
// existing two-column grid (Option A) — the narrowest, most literally
// reversible restyling of today's DOM, changeable to a single-column stack
// later with a CSS-only follow-up if the PO/UX decision lands on Option B
// instead. This is recorded here plainly as a reversible engineering
// default pending confirmation, not a resolution of §8d.
export function TenantShell({
  active,
  completedAction,
  navKeys,
  onComplete,
  onLogout,
  onSetActive,
  onToggleLanguage,
  role,
  roleActions,
  session,
}) {
  const { t } = useTranslation();
  const activeIndex = navKeys.indexOf(active);
  const activeLabel = activeIndex >= 0 ? role.nav[activeIndex] : role.nav[0];

  return (
    <div className='kf-tenant-redesign app-shell'>
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
