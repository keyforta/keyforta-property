import './ListingRequestState.styles.css';
import { Button, Spinner } from '@fluentui/react-components';
import { ArrowClockwise20Regular } from '@fluentui/react-icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { StatusMessage } from './StatusMessage.jsx';

export function ListingLoading() {
  const { t } = useTranslation();
  return <div className="listing-state" role="status" aria-live="polite"><Spinner label={t('property_pages.loading')} /></div>;
}

export function ListingError({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="listing-state" role="alert">
      <StatusMessage intent="error" title={t('property_pages.error_title')} message={t('property_pages.error_message')} />
      <Button icon={<ArrowClockwise20Regular />} onClick={onRetry}>{t('property_pages.retry')}</Button>
    </div>
  );
}

export function ListingNotFound() {
  const { t } = useTranslation();
  return (
    <section className="page content-page shell listing-state" role="status">
      <h1>{t('property_pages.not_found_title')}</h1>
      <p>{t('property_pages.not_found_message')}</p>
      <Link className="button secondary" to="/properties">{t('property_pages.back_to_properties')}</Link>
    </section>
  );
}