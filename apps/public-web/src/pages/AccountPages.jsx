import './AccountPages.styles.css';
import { Button, Field, Input, Textarea } from '@fluentui/react-components';
import { ArrowRight20Regular } from '@fluentui/react-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { StatusMessage } from '../components/StatusMessage.jsx';

export function SignInPage({ lang }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const roleRows = [
    ['tenant', t('account.roles.tenant_workspace'), t('account.roles.tenant_workspace_desc')],
    ['landlord', t('account.roles.landlord_workspace'), t('account.roles.landlord_workspace_desc')],
    ['manager', t('account.roles.manager_workspace'), t('account.roles.manager_workspace_desc')],
    ['operator', t('account.roles.operator_workspace'), t('account.roles.operator_workspace_desc')],
  ];

  return (
    <section className="page content-page shell auth-page">
      <div className="auth-intro">
        <p className="eyebrow">{t('account.signin.eyebrow')}</p>
        <h1>{t('account.signin.title')}</h1>
        <p>{t('account.signin.intro')}</p>
      </div>
      <section className="demo-access-section" aria-labelledby="demo-access-title">
        <div className="auth-section-heading">
          <div>
            <p className="eyebrow">{t('account.signin.demo_eyebrow')}</p>
            <h2 id="demo-access-title">{t('account.signin.demo_title')}</h2>
          </div>
          <p>{t('account.signin.demo_intro')}</p>
        </div>
        <div className="demo-account-grid role-grid">
          {roleRows.map((row, idx) => (
            <Button className="demo-account" key={row[0]} data-demo-role={row[0]} type="button" onClick={() => navigate(`/login/${row[0]}`)}>
              <span className="audience-icon" aria-hidden="true">{String(idx + 1).padStart(2, '0')}</span>
              <h3>{row[1]}</h3>
              <p>{row[2]}</p>
              <strong className="icon-link">{t('account.signin.open_demo')} <ArrowRight20Regular aria-hidden="true" /></strong>
            </Button>
          ))}
        </div>
      </section>
      <section className="account-entry-section" aria-labelledby="account-entry-title">
        <div className="auth-section-heading">
          <div>
            <p className="eyebrow">{t('account.signin.account_eyebrow')}</p>
            <h2 id="account-entry-title">{t('account.signin.account_title')}</h2>
          </div>
          <p>{t('account.signin.account_intro')}</p>
        </div>
        <div className="signup-entry-grid">
          <Link className="signup-entry-card landlord-entry" to="/signup/landlord">
            <span className="entry-card-body">
              <strong>{t('account.signin.landlord_entry_title')}</strong>
              <span>{t('account.signin.landlord_entry_body')}</span>
            </span>
            <span className="entry-card-action">{t('account.signin.landlord_entry_action')} <ArrowRight20Regular aria-hidden="true" /></span>
          </Link>
          <Link className="signup-entry-card operator-entry" to="/signup/operator">
            <span className="entry-card-body">
              <strong>{t('account.signin.operator_entry_title')}</strong>
              <span>{t('account.signin.operator_entry_body')}</span>
            </span>
            <span className="entry-card-action">{t('account.signin.operator_entry_action')} <ArrowRight20Regular aria-hidden="true" /></span>
          </Link>
        </div>
      </section>
    </section>
  );
}

export function WorkspaceLoginPage({ lang, role, onSubmit }) {
  const { t } = useTranslation();
  const labels = {
    tenant: { title: t('roles.tenant'), email: 'tenant@test.keyforta.com' },
    landlord: { title: t('roles.landlord'), email: 'landlord@test.keyforta.com' },
    manager: { title: t('roles.manager'), email: 'manager@test.keyforta.com' },
    operator: { title: t('roles.operator'), email: 'operator@test.keyforta.com' },
  };

  const selected = labels[role];
  if (!selected) return <SignInPage lang={lang} />;

  return (
    <section className="page content-page shell auth-page">
      <div className="workspace-login-card">
        <p className="eyebrow">{selected.title}</p>
        <h1>{t('account.login.title')}</h1>
        <p className="muted">{t('account.login.intro')}</p>
        <form
          className="form-grid"
          id="workspace-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(role, Object.fromEntries(new FormData(event.currentTarget)));
          }}
        >
          <Field label={t('email')}>
            <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          </Field>
          <Button className="button copper" type="submit">{t('account.login.continue')}</Button>
          <Button className="button secondary demo-login-button" type="button" onClick={() => onSubmit(role, { email: selected.email })}>
            {t('account.login.use')} {selected.email}
          </Button>
        </form>
        <p className="login-demo-note">{t('account.login.demo_note')}</p>
        <Link className="login-switch" to="/signin">{t('account.login.switch')}</Link>
      </div>
    </section>
  );
}

export function SignupPage({ lang, role, onSubmit }) {
  const { t } = useTranslation();
  const operator = role === 'operator';
  const [status, setStatus] = useState('');

  return (
    <section className="page content-page shell auth-page">
      <div className="workspace-login-card signup-card">
        <p className="eyebrow">{operator ? t('account.signup.operator_eyebrow') : t('account.signup.landlord_eyebrow')}</p>
        <h1>{t('account.signup.title')}</h1>
        <p className="muted">{operator ? t('account.signup.operator_intro') : t('account.signup.landlord_intro')}</p>
        <form
          className="form-grid"
          id="signup-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            setStatus(onSubmit(Object.fromEntries(new FormData(form))));
            form.reset();
          }}
        >
          <input type="hidden" name="role" value={operator ? 'maintenance_operator' : 'landlord'} readOnly />
          <Field label={t('full_name')}><Input name="name" required /></Field>
          <Field label={t('email')}><Input name="email" type="email" required /></Field>
          <Field label={t('property_pages.phone')}><Input name="phone" type="tel" required /></Field>
          {operator ? (
            <>
              <Field label={t('account.signup.services_offered')}><Input name="services" placeholder={t('account.signup.services_placeholder')} required /></Field>
              <Field label={t('account.signup.service_coverage')}><Input name="coverage" defaultValue={t('account.signup.coverage_default')} required /></Field>
            </>
          ) : (
            <Field label={t('account.signup.company_name')}><Input name="organization" required /></Field>
          )}
          <Button className="button copper" type="submit">{t('account.signup.create')}</Button>
          <StatusMessage className="form-status show" intent="success" message={status} />
        </form>
        <Link className="login-switch" to="/signin">{t('account.signup.back')}</Link>
      </div>
    </section>
  );
}

export function InviteManagerPage({ lang, onSubmit }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');

  return (
    <section className="page content-page shell auth-page">
      <div className="workspace-login-card signup-card">
        <p className="eyebrow">{t('account.invite.eyebrow')}</p>
        <h1>{t('account.invite.title')}</h1>
        <p className="muted">{t('account.invite.intro')}</p>
        <form
          className="form-grid"
          id="manager-invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            setStatus(onSubmit(Object.fromEntries(new FormData(event.currentTarget))));
          }}
        >
          <Field label={t('account.invite.manager_name')}><Input name="name" required /></Field>
          <Field label={t('account.invite.manager_email')}><Input name="email" type="email" required /></Field>
          <Field label={t('account.invite.properties')}><Input name="properties" placeholder={t('account.invite.properties_placeholder')} required /></Field>
          <Button className="button copper" type="submit">{t('account.invite.submit')}</Button>
          <StatusMessage className="form-status show" intent="success" message={status} />
        </form>
      </div>
    </section>
  );
}

export function OfferServicesPage({ lang, onSubmit }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');

  return (
    <section className="page content-page shell auth-page">
      <div className="workspace-login-card signup-card">
        <p className="eyebrow">{t('account.offer.eyebrow')}</p>
        <h1>{t('account.offer.title')}</h1>
        <p className="muted">{t('account.offer.intro')}</p>
        <form
          className="form-grid"
          id="service-offer-form"
          onSubmit={(event) => {
            event.preventDefault();
            setStatus(onSubmit(Object.fromEntries(new FormData(event.currentTarget))));
          }}
        >
          <Field label={t('account.offer.category')}><Input name="category" placeholder={t('account.offer.category_placeholder')} required /></Field>
          <Field label={t('account.offer.coverage')}><Input name="coverage" defaultValue={t('account.offer.coverage_default')} required /></Field>
          <Field label={t('account.offer.description')}><Textarea name="description" required /></Field>
          <Field label={t('account.offer.starting_rate')}><Input name="startingRate" type="number" min="0" required /></Field>
          <Button className="button copper" type="submit">{t('account.offer.submit')}</Button>
          <StatusMessage className="form-status show" intent="success" message={status} />
        </form>
      </div>
    </section>
  );
}
