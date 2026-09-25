import { useTranslation } from 'react-i18next';
import LandlordRedesign from '../index.jsx';
import { poRegressionManagerListings, poRegressionRentalProperties } from './poRegressionFixture.js';

// Dev-only visual-QA harness (not part of the production entry point/
// bundle — see landlord-redesign-preview.html, which is never referenced
// by index.html or vite.config.js's default single-page build). Renders
// the exact same `LandlordRedesign`/`LandlordShell` production component
// tree with the PO-regression fixture data standing in for
// `useRentalProperties`/`useManagerListings`' real results, so the exact
// "available unit + withdrawn listing" combination can be screenshotted
// deterministically without any database/API access. No new component,
// no new styling — this only supplies fixture props to the already-built
// production tree.
const NAV_KEYS = ['overview', 'properties', 'applications', 'leases', 'payments', 'maintenance', 'documents', 'messages'];

export function PoRegressionPreview() {
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
  const session = {
    email: 'demo.landlord@test.keyforta.com',
    role: 'landlord',
    sessionMode: 'demo',
  };

  return (
    <LandlordRedesign
      active='properties'
      completedAction=''
      listingPublicationEmptyState={t('listing_publication.empty_state_portfolio')}
      managerListings={poRegressionManagerListings}
      managerListingsError={null}
      managerListingsLoading={false}
      navKeys={NAV_KEYS}
      onComplete={() => {}}
      onLogout={() => {}}
      onSetActive={() => {}}
      onToggleLanguage={() => {}}
      rentalProperties={poRegressionRentalProperties}
      rentalPropertiesError={null}
      rentalPropertiesLoading={false}
      retryManagerListings={() => {}}
      retryRentalProperties={() => {}}
      role={role}
      roleActions={roleActions}
      session={session}
      showListingPublication
      showPropertyManagement
    />
  );
}
