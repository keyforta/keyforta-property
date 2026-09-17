import { makeStyles, mergeClasses } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const useStyles = makeStyles({
  footer: {
    paddingTop: '42px',
    paddingBottom: '42px',
    color: 'var(--logo-cream)',
    backgroundColor: 'var(--logo-aubergine)',
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    borderTopColor: 'var(--line)',
    '@media (max-width: 600px)': { paddingTop: '36px', paddingBottom: '36px' },
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '2fr repeat(3, 1fr)',
    gap: '38px',
    '& > div, & > nav': {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '10px',
    },
    '& p': {
      maxWidth: '370px',
      marginTop: '4px',
      marginBottom: 0,
      color: 'var(--logo-cream)',
    },
    '& a, & span': {
      color: 'rgba(243,238,233,.76)',
      fontSize: '.9rem',
      textDecorationLine: 'none',
    },
    '& nav strong': {
      fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    },
    '@media (max-width: 900px)': {
      gridTemplateColumns: '1fr 1fr',
      gap: '26px',
    },
    '@media (max-width: 600px)': { gridTemplateColumns: '1fr' },
  },
  brand: {
    display: 'block',
    width: '170px',
    height: '61px',
    minHeight: '61px',
    flexShrink: 0,
    '@media (max-width: 600px)': {
      width: '160px',
      height: '34px',
      minHeight: '34px',
    },
  },
  logo: {
    display: 'block',
    width: '170px',
    height: '61px',
    objectFit: 'contain',
    '@media (max-width: 600px)': { display: 'none' },
  },
  wordmark: {
    display: 'none',
    width: '160px',
    height: '34px',
    objectFit: 'contain',
    '@media (max-width: 600px)': { display: 'block' },
  },
});

export function Footer() {
  const { t } = useTranslation();
  const styles = useStyles();

  return (
    <footer className={styles.footer}>
      <div className={mergeClasses('shell', styles.grid)}>
        <div>
          <Link className={styles.brand} to="/home" aria-label={t('a11y.keyforta_home')}>
            <img
              className={styles.logo}
              src="/assets/brand/keyforta-logo-reversed.png"
              width="1400"
              height="500"
              alt="KEYFORTA"
            />
            <img
              className={styles.wordmark}
              src="/assets/brand/keyforta-wordmark-reversed.png"
              width="1000"
              height="210"
              alt="KEYFORTA"
            />
          </Link>
          <p>{t('footer_summary')}</p>
        </div>
        <nav aria-label={t('a11y.footer_explore')}>
          <strong>{t('explore')}</strong>
          <Link to="/properties">{t('nav_properties')}</Link>
          <Link to="/how">{t('nav_how')}</Link>
          <Link to="/landlords">{t('nav_landlords')}</Link>
          <Link to="/signin">{t('sign_in')}</Link>
        </nav>
        <nav aria-label={t('a11y.footer_company')}>
          <strong>{t('company')}</strong>
          <Link to="/trust">{t('nav_trust')}</Link>
          <Link to="/faq">{t('faq_short')}</Link>
          <Link to="/contact">{t('contact')}</Link>
        </nav>
        <nav aria-label={t('a11y.footer_legal')}>
          <strong>{t('legal')}</strong>
          <Link to="/privacy">{t('privacy')}</Link>
          <Link to="/terms">{t('terms')}</Link>
          <span>© 2026 KEYFORTA</span>
        </nav>
      </div>
    </footer>
  );
}
