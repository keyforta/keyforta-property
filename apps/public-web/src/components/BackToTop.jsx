import { Button, makeStyles, Tooltip } from '@fluentui/react-components';
import { ArrowUp24Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const useStyles = makeStyles({
  button: {
    position: 'fixed',
    right: '24px',
    bottom: '24px',
    zIndex: 9,
    width: '48px',
    minWidth: '48px',
    height: '48px',
    minHeight: '48px',
    padding: 0,
    color: '#fff',
    backgroundColor: 'var(--logo-aubergine)',
    borderRadius: '50%',
    boxShadow: '0 10px 28px rgba(36,22,46,.28)',
    ':hover': {
      color: '#fff',
      backgroundColor: 'var(--aubergine)',
    },
    ':focus-visible': {
      outlineStyle: 'solid',
      outlineWidth: '3px',
      outlineColor: 'var(--logo-teal)',
      outlineOffset: '3px',
    },
    '@media (max-width: 600px)': {
      right: '16px',
      bottom: '16px',
    },
  },
});

export function BackToTop() {
  const { t } = useTranslation();
  const styles = useStyles();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 400);
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  if (!visible) return null;

  const label = t('common.back_to_top');
  return (
    <Tooltip content={label} relationship="label">
      <Button
        aria-label={label}
        className={styles.button}
        icon={<ArrowUp24Regular />}
        onClick={() => {
          const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        }}
      />
    </Tooltip>
  );
}
