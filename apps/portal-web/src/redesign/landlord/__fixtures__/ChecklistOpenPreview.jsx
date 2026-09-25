import { useTranslation } from 'react-i18next';
import LandlordRedesign from '../index.jsx';
import {
  checklistOpenManagerListings,
  checklistOpenRentalProperties,
  createChecklistOpenSession,
} from './checklistOpenFixture.js';

// Dev-only visual/E2E-QA harness (not part of the production entry point/
// bundle — see landlord-redesign-checklist-preview.html, which is never
// referenced by index.html or vite.config.js's default single-page
// build), paired with `checklistOpenFixture.js`. Renders the exact same
// `LandlordRedesign`/`LandlordShell`/`NextBestActionChecklist`/
// `PropertyManagementPanel` production component tree used in production,
// with fixture props standing in for `useRentalProperties`/
// `useManagerListings`' real results and a session shape that lets
// `property-management-panel.jsx`'s own (protected, unmodified) token-
// resolution effect reach `tokenStatus === 'ready'`, so the real "Manage
// this unit" toggle is genuinely clickable — letting
// `openSoleUnitManagementControl` be exercised end-to-end in a real
// browser (Copilot PR #134 review, cycle-4 finding #2/#4).
const NAV_KEYS = ['overview', 'properties', 'applications', 'leases', 'payments', 'maintenance', 'documents', 'messages'];

export function ChecklistOpenPreview() {
  const { t } = useTranslation();
  const role = {
    eyebrow: t('roles.landlord.eyebrow'),
    title: t('roles.landlord.title'),
    summary: t('roles.landlord.summary'),
    nav: t('roles.landlord.nav', { returnObjects: true }),
    statsEmptyState: t('roles.landlord.stats_empty_state'),
    rowsEmptyState: t('roles.landlord.rows_empty_state'),
  };
  const roleActions = t('actions.landlord', { returnObjects: true });

  return (
    <LandlordRedesign
      active='overview'
      completedAction=''
      listingPublicationEmptyState={t('listing_publication.empty_state_portfolio')}
      managerListings={checklistOpenManagerListings}
      managerListingsError={null}
      managerListingsLoading={false}
      navKeys={NAV_KEYS}
      onComplete={() => {}}
      onLogout={() => {}}
      onSetActive={() => {}}
      onToggleLanguage={() => {}}
      rentalProperties={checklistOpenRentalProperties}
      rentalPropertiesError={null}
      rentalPropertiesLoading={false}
      retryManagerListings={() => {}}
      retryRentalProperties={() => {}}
      role={role}
      roleActions={roleActions}
      session={createChecklistOpenSession()}
      showListingPublication={false}
      showPropertyManagement
    />
  );
}
