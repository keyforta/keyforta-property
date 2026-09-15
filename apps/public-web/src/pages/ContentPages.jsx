import './ContentPages.styles.css';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Field,
  Input,
  makeStyles,
  mergeClasses,
  Select,
  Textarea,
  tokens,
} from '@fluentui/react-components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/StatusMessage.jsx';

const useContactStyles = makeStyles({
  form: {
    display: 'grid',
    gap: tokens.spacingVerticalL,
  },
  field: {
    minWidth: 0,
    '& label': {
      marginBottom: tokens.spacingVerticalXS,
      fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
      fontSize: tokens.fontSizeBase300,
      fontWeight: tokens.fontWeightSemibold,
    },
  },
  control: {
    width: '100%',
    minHeight: '48px',
    backgroundColor: '#fff',
    borderTopColor: 'var(--line)',
    borderRightColor: 'var(--line)',
    borderBottomColor: 'var(--line)',
    borderLeftColor: 'var(--line)',
    borderRadius: '12px',
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
  message: {
    minHeight: '132px',
    '& textarea': {
      minHeight: '116px',
      resize: 'vertical',
    },
  },
  submit: {
    width: '100%',
    minHeight: '48px',
  },
});

function DemoFormStatus({ message }) {
  return <StatusMessage className="form-status show" intent="success" message={message} />;
}

function LandlordsSection({ lang }) {
  const { t } = useTranslation();
  const bullets = t('content.landlords.bullets', { returnObjects: true, defaultValue: [] });
  const caps = t('content.landlords.caps', { returnObjects: true, defaultValue: [] });

  return (
    <section className="page content-page shell content-narrow">
      <p className="eyebrow">{t('content.landlords.eyebrow')}</p>
      <h1>{t('content.landlords.title')}</h1>
      <p className="muted">{t('content.landlords.intro')}</p>
      <ul>
        {bullets.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <div className="mini-capability-list">
        {caps.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}

function HowSection({ lang }) {
  const { t } = useTranslation();
  const steps = t('content.how.steps', { returnObjects: true, defaultValue: [] });

  return (
    <section className="page content-page">
      <div className="shell route-shell">
        <p className="eyebrow">{t('content.how.eyebrow')}</p>
        <h1>{t('content.how.title')}</h1>
        <p className="intro-copy">{t('content.how.intro')}</p>
        <div className="feature-grid">
          {steps.map((step) => (
            <article className="feature" key={step[0]}>
              <span className="number" aria-hidden="true">{step[0]}</span>
              <h3>{step[1]}</h3>
              <p>{step[2]}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection({ lang }) {
  const { t } = useTranslation();
  const steps = t('content.trust.steps', { returnObjects: true, defaultValue: [] });

  return (
    <section className="page content-page">
      <div className="shell route-shell">
        <p className="eyebrow">{t('content.trust.eyebrow')}</p>
        <h1>{t('content.trust.title')}</h1>
        <p>{t('content.trust.intro')}</p>
        <div className="trust-steps">
          {steps.map((step) => (
            <article key={step[0]}>
              <span className="number" aria-hidden="true">{step[0]}</span>
              <h3>{step[1]}</h3>
              <p>{step[2]}</p>
            </article>
          ))}
        </div>
        <h2>{t('content.trust.principles_title')}</h2>
        <div className="principle-list">
          <p>
            <strong>{t('content.trust.principle_1_title')}</strong>{' '}
            {t('content.trust.principle_1_body')}
          </p>
          <p>
            <strong>{t('content.trust.principle_2_title')}</strong>{' '}
            {t('content.trust.principle_2_body')}
          </p>
          <p>
            <strong>{t('content.trust.principle_3_title')}</strong>{' '}
            {t('content.trust.principle_3_body')}
          </p>
        </div>
        <StatusMessage className="notice" intent="warning" title={t('content.trust.stay_safe')} message={t('content.trust.stay_safe_body')} />
      </div>
    </section>
  );
}

function FaqSection({ lang }) {
  const { t } = useTranslation();
  const questions = t('content.faq.items', { returnObjects: true, defaultValue: [] });

  return (
    <section className="page content-page shell route-shell">
      <p className="eyebrow">{t('content.faq.eyebrow')}</p>
      <h1>{t('content.faq.title')}</h1>
      <Accordion className="faq-list" collapsible>
        {questions.map((row, index) => (
          <AccordionItem className="faq-item" key={row[0]} value={`faq-${index}`}>
            <AccordionHeader>{row[0]}</AccordionHeader>
            <AccordionPanel><p>{row[1]}</p></AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function ContactSection({ lang, onContactSubmit }) {
  const { t } = useTranslation();
  const styles = useContactStyles();
  const [status, setStatus] = useState('');

  return (
    <section className="page content-page shell">
      <div className="contact-grid">
        <div className="contact-card">
          <p className="eyebrow">{t('contact')}</p>
          <h1>{t('content.contact.title')}</h1>
          <p className="muted">{t('content.contact.intro')}</p>
          <p>
            <strong>{t('content.contact.email')}</strong>
            <br />
            <a href="mailto:hello@keyforta.com">hello@keyforta.com</a>
          </p>
          <p>
            <strong>{t('content.contact.market')}</strong>
            <br />
            {t('content.contact.market_value')}
          </p>
          <StatusMessage
            className="support-note"
            intent="info"
            title={t('content.contact.notice_title')}
            message={t('content.contact.notice_body')}
          />
        </div>

        <div className="form-card">
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              setStatus(onContactSubmit(Object.fromEntries(new FormData(event.currentTarget))));
              event.currentTarget.reset();
            }}
          >
            <Field className={styles.field} label={t('full_name')}>
              <Input className={styles.control} size="large" name="name" required />
            </Field>
            <Field className={styles.field} label={t('email')}>
              <Input className={styles.control} size="large" name="email" type="email" required />
            </Field>
            <Field className={styles.field} label={t('content.contact.topic')}>
              <Select className={styles.control} size="large" name="topic">
                <option value="general">{t('content.contact.topic_general')}</option>
                <option value="tenant_support">{t('content.contact.topic_tenant')}</option>
                <option value="landlord_inquiry">{t('content.contact.topic_landlord')}</option>
                <option value="safety_concern">{t('content.contact.topic_report')}</option>
              </Select>
            </Field>
            <Field className={styles.field} label={t('content.contact.message')}>
              <Textarea className={mergeClasses(styles.control, styles.message)} size="large" name="message" required />
            </Field>
            <Button appearance="primary" className={styles.submit} size="large" type="submit">
              {t('content.contact.submit')}
            </Button>
            <DemoFormStatus message={status} />
          </form>
        </div>
      </div>
    </section>
  );
}

function LegalSection({ lang, kind }) {
  const { t } = useTranslation();
  const privacy = kind === 'privacy';

  return (
    <section className="page content-page shell content-narrow">
      <p className="eyebrow">{t('legal')}</p>
      <h1>
        {privacy ? t('content.legal.privacy_title') : t('content.legal.terms_title')}
      </h1>
      <StatusMessage className="notice" intent="warning" title={t('content.legal.draft_label')} message={t('content.legal.draft_body')} />

      {privacy ? (
        <>
          <h2>{t('content.legal.privacy.collected_title')}</h2>
          <p>{t('content.legal.privacy.collected_body')}</p>
          <h2>{t('content.legal.privacy.storage_title')}</h2>
          <p>{t('content.legal.privacy.storage_body')}</p>
          <h2>{t('content.legal.privacy.choices_title')}</h2>
          <p>{t('content.legal.privacy.choices_body')}</p>
        </>
      ) : (
        <>
          <h2>{t('content.legal.terms.demo_title')}</h2>
          <p>{t('content.legal.terms.demo_body')}</p>
          <h2>{t('content.legal.terms.acceptable_title')}</h2>
          <p>{t('content.legal.terms.acceptable_body')}</p>
          <h2>{t('content.legal.terms.reliance_title')}</h2>
          <p>{t('content.legal.terms.reliance_body')}</p>
        </>
      )}
    </section>
  );
}

export function TextContentPage({ lang, kind, onContactSubmit }) {
  if (kind === 'how') return <HowSection lang={lang} />;
  if (kind === 'landlords') return <LandlordsSection lang={lang} />;
  if (kind === 'trust') return <TrustSection lang={lang} />;
  if (kind === 'faq') return <FaqSection lang={lang} />;
  if (kind === 'contact') return <ContactSection lang={lang} onContactSubmit={onContactSubmit} />;
  if (kind === 'privacy' || kind === 'terms') return <LegalSection lang={lang} kind={kind} />;
  return null;
}
