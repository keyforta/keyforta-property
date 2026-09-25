import { useTranslation } from 'react-i18next';
import { StatusBadge } from '../../landlord/components/StatusBadge.jsx';

// docs/product/MANAGER_REDESIGN_SPEC.md §3.1/§5.5: listing status badges
// use the same `StatusBadge` tone table as Landlord (draft -> neutral,
// published -> positive, withdrawn -> negative). `ListingPublicationPanel`
// (protected, unmodified, imported as-is per this file's hard
// constraints) renders its own per-row status text as a plain
// `<span className='status'>` with no swappable slot, so `StatusBadge`
// cannot be substituted into that reused, protected markup without
// forking it — the exact same limitation already accepted for Landlord's
// own redesign (see `../../landlord/LandlordShell.jsx`'s `statusTone.js`-
// based CSS annotation of that identical reused markup, which this
// module's sibling `applyListingStatusTone` in `ManagerShell.jsx` reuses
// unmodified for the real, rendered listing rows).
//
// This legend is the one place `StatusBadge` is imported and rendered
// directly, per the hard requirement to import it (not duplicate/fork
// it) from `../landlord/...`: a small, static, purely presentational key
// explaining what each already-existing badge color means on the
// Portfolio screen's listing rows below it. It reads no data, computes no
// domain state, and adds no new capability — it only labels, with the
// shared design-system component, the exact three status values
// `listing-publication-panel.jsx` already renders today.
export function PortfolioStatusLegend() {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t('listing_publication.assigned_listings')}
      className='kf-status-legend'
      data-testid='portfolio-status-legend'
      role='group'
    >
      <StatusBadge tone='neutral'>{t('listing_publication.status.draft.badge')}</StatusBadge>
      <StatusBadge tone='positive'>{t('listing_publication.status.published.badge')}</StatusBadge>
      <StatusBadge tone='negative'>{t('listing_publication.status.withdrawn.badge')}</StatusBadge>
    </div>
  );
}
