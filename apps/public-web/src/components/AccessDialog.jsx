import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  makeStyles,
  Select,
} from '@fluentui/react-components';
import { Dismiss20Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from './StatusMessage.jsx';

const useStyles = makeStyles({
  body: {
    position: 'relative',
    paddingTop: '36px',
    paddingRight: '36px',
    paddingBottom: '36px',
    paddingLeft: '36px',
    backgroundColor: '#fff',
    '& h2': {
      marginTop: 0,
      marginRight: '45px',
      marginBottom: 0,
      fontSize: '2rem',
      lineHeight: 1.1,
    },
    '@media (max-width: 600px)': {
      paddingTop: '26px',
      paddingRight: '22px',
      paddingBottom: '26px',
      paddingLeft: '22px',
    },
  },
  surface: {
    width: 'min(570px, calc(100vw - 28px))',
    maxWidth: '570px',
    maxHeight: 'calc(100vh - 32px)',
    padding: 0,
    overflowY: 'auto',
    borderTopStyle: 'none',
    borderRightStyle: 'none',
    borderBottomStyle: 'none',
    borderLeftStyle: 'none',
    borderRadius: '22px',
    boxShadow: '0 30px 90px rgba(36,22,46,.4)',
  },
  titleContent: { display: 'grid', gap: '8px' },
  eyebrow: {
    color: 'var(--logo-copper)',
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontSize: '.76rem',
    fontWeight: 800,
    letterSpacing: '.15em',
    textTransform: 'uppercase',
  },
  content: {
    display: 'grid',
    gap: '17px',
    marginTop: '18px',
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    padding: 0,
  },
  intro: {
    marginTop: 0,
    marginBottom: 0,
    color: 'var(--muted)',
    fontSize: '1rem',
    lineHeight: 1.55,
  },
  form: { display: 'grid', gap: '17px' },
  field: {
    minWidth: 0,
    '& label': {
      marginBottom: '6px',
      fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
      fontSize: '.86rem',
      fontWeight: 700,
    },
  },
  control: {
    width: '100%',
    minHeight: '46px',
    backgroundColor: '#fff',
    borderTopColor: 'var(--line)',
    borderRightColor: 'var(--line)',
    borderBottomColor: 'var(--line)',
    borderLeftColor: 'var(--line)',
    borderRadius: '10px',
    ':focus-within': {
      borderTopColor: 'var(--logo-teal)',
      borderRightColor: 'var(--logo-teal)',
      borderBottomColor: 'var(--logo-teal)',
      borderLeftColor: 'var(--logo-teal)',
      outlineStyle: 'solid',
      outlineWidth: '3px',
      outlineColor: 'rgba(49,112,108,.2)',
      outlineOffset: '1px',
    },
  },
  submit: { width: '100%', minHeight: '56px' },
  close: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    width: '40px',
    minWidth: '40px',
    maxWidth: '40px',
    height: '40px',
    minHeight: '40px',
    maxHeight: '40px',
    padding: 0,
    color: 'var(--logo-aubergine)',
    backgroundColor: 'var(--logo-cream)',
    borderTopStyle: 'none',
    borderRightStyle: 'none',
    borderBottomStyle: 'none',
    borderLeftStyle: 'none',
    borderRadius: '50%',
    '::after': { display: 'none' },
    ':hover': {
      color: 'var(--logo-aubergine)',
      backgroundColor: 'var(--bone)',
    },
    ':focus-visible': {
      outlineStyle: 'solid',
      outlineWidth: '2px',
      outlineColor: 'var(--logo-teal)',
      outlineOffset: '2px',
    },
  },
});

export function AccessDialog({ lang, open, interest, onClose, onSubmit }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) setStatus('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className={styles.surface} aria-labelledby="access-title" aria-describedby="access-description">
        <DialogBody className={styles.body}>
          <DialogTitle
            id="access-title"
            action={
              <Button
                appearance="subtle"
                className={styles.close}
                type="button"
                icon={<Dismiss20Regular />}
                aria-label={t('common.close')}
                onClick={onClose}
              />
            }
          >
            <span className={styles.titleContent}>
              <span className={styles.eyebrow}>{t('early_access')}</span>
              <span>{t('join_launch')}</span>
            </span>
          </DialogTitle>
          <DialogContent className={styles.content}>
            <p className={styles.intro} id="access-description">{t('access_intro')}</p>
            <form
              id="access-form"
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(new FormData(event.currentTarget));
                setStatus(onSubmit(values));
                event.currentTarget.reset();
              }}
            >
              <input type="hidden" name="interest" id="access-interest" value={interest} readOnly />
              <Field className={styles.field} label={t('full_name')}>
                <Input className={styles.control} size="large" name="name" autoComplete="name" required />
              </Field>
              <Field className={styles.field} label={t('email')}>
                <Input className={styles.control} size="large" name="email" type="email" autoComplete="email" required />
              </Field>
              <Field className={styles.field} label={t('i_am')}>
                <Select key={interest || 'access-role'} className={styles.control} size="large" name="role" defaultValue={interest} required>
                  <option value="">{t('select_one')}</option>
                  <option value="tenant">{t('roles.tenant')}</option>
                  <option value="landlord">{t('roles.landlord')}</option>
                  <option value="property_manager">{t('roles.manager')}</option>
                  <option value="maintenance_operator">{t('roles.operator')}</option>
                </Select>
              </Field>
              <Field className={styles.field} label={t('location')}>
                <Input className={styles.control} size="large" name="location" autoComplete="address-level2" />
              </Field>
              <Button appearance="primary" className={styles.submit} size="large" type="submit">{t('submit_request')}</Button>
              <StatusMessage className="form-status show" intent="success" message={status} />
            </form>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
