import { useEffect, useRef } from 'react';
import { Avatar, Button } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n.js';
import { ListingPublicationPanel } from '../../listing-publication-panel.jsx';
import { PropertyManagementPanel } from '../../property-management-panel.jsx';
import { LandlordBrandHeader } from './components/BrandHeader.jsx';
import { NextBestActionChecklist } from './components/NextBestActionChecklist.jsx';
import landlordRedesignCopyEn from './locales/en.json';
import landlordRedesignCopyFr from './locales/fr.json';
import { annotateAccessibleStatusLabels, annotateStatusTone } from './statusTone.js';
import { openSoleUnitManagementControl } from './unitManagement.js';

// Copilot PR #134 review, cycle-3/4 finding #1: this redesign's own
// translated copy (`landlord_redesign.*`) must not live in the always-
// eagerly-loaded `src/locales/{en,fr}.json` (imported unconditionally by
// `src/i18n.js`, which every session loads regardless of role or flag
// state) — that would ship redesign copy to every user even when
// `VITE_REDESIGN_ENABLED` is off, undermining the "brand assets in lazy
// chunk" acceptance criterion (zero bytes of redesign-specific content
// when the flag is off). Registering it here, as a side effect of this
// module's own evaluation, means it is only ever added to the shared
// i18n instance once this module is actually imported — which, in
// production, only happens via the lazy `./index.jsx` chunk (this file
// is not imported from anywhere outside `./redesign/landlord/`). `true,
// true` = deep-merge, overwrite-on-reload so repeated evaluation in dev/
// HMR (or across test files) stays idempotent rather than erroring on a
// duplicate key.
i18n.addResourceBundle('en', 'translation', landlordRedesignCopyEn, true, true);
i18n.addResourceBundle('fr', 'translation', landlordRedesignCopyFr, true, true);

// DOM anchor ids this shell controls itself (not inside the reused
// black-box panels) so the checklist card (§10.2) can scroll to the
// relevant already-rendered panel without reaching into
// PropertyManagementPanel/ListingPublicationPanel internals.
const PROPERTY_MANAGEMENT_ANCHOR_ID = 'kf-property-management-anchor';

function scrollToPropertyManagement() {
  document.getElementById(PROPERTY_MANAGEMENT_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Regression fix (PO live-review finding): a unit's own occupancy
// `availabilityStatus` badge and its listing's publication
// `status`/`mediaReviewStatus` badges are unrelated fields that can
// legitimately disagree (e.g. unit "Available" + listing "Withdrawn" is
// correct, not a contradiction), but the §10.4/§11 visual chunking work
// placed them close together with no distinguishing caption, which read
// as a bug to the PO. redesign.css adds a small caption before each
// group via `content: var(--kf-unit-status-label)` / `var(--kf-listing-
// status-label)` — CSS `content` needs the custom property's value to
// already be a quoted CSS string, so this escapes the translated text
// per CSS string-literal rules (backslash and double-quote) before
// wrapping it in quotes here, rather than hardcoding English text in
// redesign.css (see that file's comment for why the older §10.4 labels
// are a separate, already-flagged exception rather than a precedent to
// repeat).
function cssQuotedString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// Same 8 landlord nav keys as `roleNavKeys.landlord` in portal-app.jsx (not
// re-derived here — passed in as `navKeys` from the existing computation in
// `Portal()` so this file never invents its own navigation model).
//
// This component intentionally mirrors the JSX shape of `Portal()`'s
// existing return value (§4.1-4.3 of the spec: "unchanged structural IA,
// restyled"). It reuses the exact same panels
// (`ListingPublicationPanel`, `PropertyManagementPanel`), the exact same
// session/hooks results, and the exact same i18n copy — only markup
// chrome (sidebar/topbar/cards) and CSS classes are new, all scoped under
// `.kf-landlord-redesign` (see redesign.css) so nothing here can leak into
// or duplicate the existing (flag-off) rendering path.
export function LandlordShell({
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
  rentalProperties,
  rentalPropertiesError,
  rentalPropertiesLoading,
  retryManagerListings,
  retryRentalProperties,
  role,
  roleActions,
  session,
  showListingPublication,
  showPropertyManagement,
}) {
  const { t } = useTranslation();
  const activeIndex = navKeys.indexOf(active);
  const activeLabel = activeIndex >= 0 ? role.nav[activeIndex] : role.nav[0];
  const rootRef = useRef(null);

  // Copilot PR #134 review finding #2 (and remediation cycle 2, finding
  // #1): annotate the reused (protected, unchanged) `.status` badges with
  // a tone attribute derived purely from their already-rendered text,
  // since that markup carries no status-specific class/attribute of its
  // own. The SAME withdrawn listing renders as two separate DOM copies —
  // once inside `ListingPublicationPanel` (a sibling of the
  // property-management anchor, not a descendant of it) and once inside
  // `PropertyManagementPanel`'s read-only `PublicListingForm` — so the
  // observer must cover the whole shell root this component owns, not
  // just the property-management anchor, or the ListingPublicationPanel
  // copy silently keeps the reused green styling. A MutationObserver (not
  // a one-shot effect keyed on props) is used because either reused
  // panel's own internal state (e.g. after a successful set-availability/
  // publish/withdraw action) can re-render these badges independently of
  // this shell's own `rentalProperties`/`managerListings` props changing.
  useEffect(() => {
    const container = rootRef.current;
    if (!container) return undefined;
    const negativeTexts = new Set([
      t('property_management.unit_availability_status.unavailable'),
      t('property_management.listing_status.withdrawn'),
      t('listing_publication.status.withdrawn.badge'),
    ]);
    // Copilot PR #134 review, cycle-3/4 finding #6: the same observer
    // that annotates tone also annotates the accessible unit-status/
    // listing-status distinction (see statusTone.js) so a screen reader
    // gets the same grouping distinction the CSS `::before` captions give
    // sighted users, kept in sync across the same re-renders (this
    // shell's own props changing, or either reused panel's internal
    // state changing after a successful command).
    const accessibleLabels = {
      unitStatusLabel: t('landlord_redesign.status_labels.unit_status'),
      listingStatusLabel: t('landlord_redesign.status_labels.listing_status'),
    };
    annotateStatusTone(container, negativeTexts);
    annotateAccessibleStatusLabels(container, accessibleLabels);
    const observer = new MutationObserver(() => {
      annotateStatusTone(container, negativeTexts);
      annotateAccessibleStatusLabels(container, accessibleLabels);
    });
    observer.observe(container, { characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [t, showListingPublication, showPropertyManagement, managerListings, rentalProperties]);

  // Copilot PR #134 review, cycle-3/4 finding #3: spec §10.2 requires
  // that clicking the "Set pricing & availability" checklist row not just
  // scroll but, when exactly one property/unit exists, also open that
  // unit's existing "Manage this unit" toggle
  // (property-management-panel.jsx's own `UnitPricingAvailabilityForm`,
  // unmodified) — every other row keeps the existing scroll-only
  // behavior (§10.2's "opens the relevant existing control" language
  // applies specifically to this row's own control).
  const handleChecklistRowAction = (key) => {
    scrollToPropertyManagement();
    if (key === 'setPricing' && rootRef.current) {
      openSoleUnitManagementControl(rootRef.current, rentalProperties, t('property_management.manage_unit_toggle'));
    }
  };

  return (
    <div className='kf-landlord-redesign app-shell' ref={rootRef}>
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
          {active === 'overview' ? (
            <NextBestActionChecklist
              listings={managerListings}
              onRowAction={handleChecklistRowAction}
              properties={rentalProperties}
            />
          ) : null}
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
            <div
              className='kf-grid-full'
              id={PROPERTY_MANAGEMENT_ANCHOR_ID}
              style={{
                '--kf-unit-status-label': cssQuotedString(t('landlord_redesign.status_labels.unit_status')),
                '--kf-listing-status-label': cssQuotedString(t('landlord_redesign.status_labels.listing_status')),
                // Copilot PR #134 review, cycle-3/4 finding #5: these two
                // sub-form captions reuse the SAME existing i18n keys
                // property-management-panel.jsx (protected, unmodified)
                // already uses for these forms' own (screen-reader-only)
                // `aria-label`s — not new redesign-only copy — via the
                // same JS-translated-CSS-custom-property mechanism as the
                // unit/listing status labels above, instead of a
                // hardcoded English `content:` string in redesign.css.
                '--kf-pricing-form-label': cssQuotedString(t('property_management.pricing_form_label')),
                '--kf-availability-form-label': cssQuotedString(t('property_management.availability_form_label')),
              }}
            >
              <PropertyManagementPanel
                feedError={rentalPropertiesError}
                feedLoading={rentalPropertiesLoading}
                listings={managerListings}
                onRetryFeed={retryRentalProperties}
                onRetryListingsFeed={retryManagerListings}
                properties={rentalProperties}
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
