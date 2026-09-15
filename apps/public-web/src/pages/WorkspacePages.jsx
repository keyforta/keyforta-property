import './WorkspacePages.styles.css';
import { Badge, Button, Tab, TabList } from '@fluentui/react-components';
import {
  Add20Regular,
  ArrowUpRight20Regular,
  Chat20Regular,
  CheckmarkCircle20Filled,
  Clock20Regular,
  Home20Regular,
  Money20Regular,
  Warning20Regular,
} from '@fluentui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { SignInPage } from './AccountPages.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { workspaceMenu } from '../data/content.js';

const activityIcons = {
  add: Add20Regular,
  clock: Clock20Regular,
  complete: CheckmarkCircle20Filled,
  home: Home20Regular,
  message: Chat20Regular,
  payment: Money20Regular,
  viewing: ArrowUpRight20Regular,
  warning: Warning20Regular,
};

function ActivityIcon({ type }) {
  const Icon = activityIcons[type];
  return Icon ? <Icon aria-hidden="true" /> : type;
}

export function DemoApiPage({ lang, statuses, onCrud }) {
  const { t } = useTranslation();
  const api = window.KeyfortaMockApi;

  const roleNames = {
    tenant: t('roles_short.tenant'),
    landlord: t('roles_short.landlord'),
    property_manager: t('roles_short.property_manager'),
    maintenance_operator: t('roles_short.maintenance_operator'),
  };

  return (
    <section className="page content-page shell api-page">
      <div className="auth-intro">
        <p className="eyebrow">
          {t('api.eyebrow')} <Badge as="span" className="demo-label" appearance="tint" color="informative">{t('common.mock_data')}</Badge>
        </p>
        <h1>{t('api.title')}</h1>
        <p>{t('api.intro')}</p>
      </div>
      <div className="api-contract-note">
        <strong>{t('api.integration_label')}</strong> {t('api.integration')}
      </div>
      <div className="api-resource-grid">
        {Object.entries(api.definitions).map(([resource, definition], idx) => (
          <article className="api-resource" key={resource} data-resource-card={resource}>
            <div className="api-resource-head">
              <span className="number">{String(idx + 1).padStart(2, '0')}</span>
              <div>
                <h2>{t(`api.resource_labels.${resource}`, { defaultValue: definition.label })}</h2>
                <p>{resource}</p>
              </div>
            </div>
            <h3>{t('api.fields')}</h3>
            <p className="api-fields">{definition.fields.join(' · ')}</p>
            <h3>{t('api.permissions')}</h3>
            <div className="api-permissions">
              {Object.entries(api.permissions).map(([role, permissions]) => (
                <span key={`${resource}-${role}`} title={roleNames[role]}>
                  <strong>{roleNames[role]}</strong>
                  {permissions[resource] || 'none'}
                </span>
              ))}
            </div>
            <div className="api-crud">
              <Button className="button secondary" onClick={() => onCrud(resource, 'create')}>{t('api.create')}</Button>
              <Button className="button secondary" onClick={() => onCrud(resource, 'read')}>{t('api.read')}</Button>
              <Button className="button secondary" onClick={() => onCrud(resource, 'update')}>{t('api.update')}</Button>
              <Button className="button secondary" onClick={() => onCrud(resource, 'delete')}>{t('api.remove')}</Button>
            </div>
            <StatusMessage className="form-status api-status show" intent="info" message={statuses[resource] || t('status.api_idle')} />
          </article>
        ))}
      </div>
      <StatusMessage className="notice" intent="warning" title={t('api.security_label')} message={t('api.security')} />
    </section>
  );
}

export function WorkspacePage({ lang, role, section, managerApplications, onAction }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const roleLabel = t(`roles.${role}`, { defaultValue: '' });
  const [actionStatus, setActionStatus] = useState('');

  useEffect(() => {
    setActionStatus('');
  }, [role, section, lang]);

  const data = t(`workspace.data.${role}`, { returnObjects: true, defaultValue: null });
  if (!roleLabel || !data) return <SignInPage lang={lang} />;

  const moduleCopy = section && section !== 'dashboard'
    ? t(`workspace.modules.${section}`, { returnObjects: true, defaultValue: null })
    : null;

  const sections = useMemo(() => {
    if (role !== 'manager' || !managerApplications.length) return data.sections;
    const latest = managerApplications[managerApplications.length - 1];
    const rowTitle = t('workspace.manager.dynamic_row_title', { count: managerApplications.length });
    const rowMeta = `${latest.name || t('workspace.manager.dynamic_default_name')} · ${latest.propertyId || t('workspace.manager.dynamic_default_property')}`;

    return [{ title: t('workspace.manager.dynamic_panel_title'), rows: [['01', rowTitle, rowMeta, t('workspace.manager.dynamic_action'), '']] }, ...data.sections];
  }, [data.sections, managerApplications, role, t]);

  const actions = {
    tenant: ['request-maintenance', 'message-manager'],
    landlord: ['review-maintenance', 'invite-manager'],
    manager: ['assign-work-order', 'request-evidence'],
    operator: ['accept-job', 'submit-quote', 'start-report', 'offer-services'],
  };

  return (
    <section className="page content-page shell workspace-page">
      <div className="workspace-top">
        <div>
          <p className="eyebrow">
            {data.label} <Badge as="span" className="demo-label" appearance="tint" color="informative">{t('common.mock_data')}</Badge>
          </p>
          <h1>{data.title}</h1>
          <p className="muted">{data.subtitle}</p>
        </div>
        <Link className="button secondary" to="/signin">{t('workspace.change_role')}</Link>
      </div>

      <StatusMessage
        className="workspace-banner"
        intent="warning"
        title={t('workspace.demo_workspace')}
        message={t('workspace.banner')}
      />

      <TabList
        className="workspace-tabs"
        selectedValue={section}
        onTabSelect={(_, data) => navigate(data.value === 'dashboard' ? `/demo/${role}` : `/demo/${role}/${data.value}`)}
      >
        {workspaceMenu[role].map((item) => (
          <Tab key={item} value={item}>{t(`workspace.menu.${item}`, { defaultValue: item })}</Tab>
        ))}
      </TabList>

      {moduleCopy && (
        <section className="workspace-module" aria-labelledby="workspace-module-title">
          <div>
            <p className="eyebrow">{t('workspace.selected_module')}</p>
            <h2 id="workspace-module-title">{moduleCopy[0]}</h2>
            <p>{moduleCopy[1]}</p>
          </div>
          <Badge className="module-chip" appearance="tint" color="informative">{t('workspace.demo_view')}</Badge>
        </section>
      )}

      <div className="workspace-stats">
        {data.stats.map((stat) => (
          <div className="workspace-stat" key={stat.join('-')}>
            <span>{stat[0]}</span>
            <strong>{stat[1]}</strong>
            <small>{stat[2]}</small>
          </div>
        ))}
      </div>

      <div className="workspace-grid">
        {sections.map((panel) => (
          <section className="workspace-panel" key={panel.title}>
            <h2>{panel.title}</h2>
            {panel.rows.map((row) => (
              <div className="activity-row" key={row.join('-')}>
                <span className="activity-icon" aria-hidden="true"><ActivityIcon type={row[0]} /></span>
                <div>
                  <strong>{row[1]}</strong>
                  <p>{row[2]}</p>
                </div>
                <Badge className={`status-pill ${row[4]}`.trim()} appearance="tint" color={row[4] === 'teal' ? 'success' : 'warning'}>{row[3]}</Badge>
              </div>
            ))}
          </section>
        ))}
        <section className="workspace-panel workspace-actions">
          <h2>
            {role === 'tenant' && t('workspace.actions.tenant_title')}
            {role === 'landlord' && t('workspace.actions.landlord_title')}
            {role === 'manager' && t('workspace.actions.manager_title')}
            {role === 'operator' && t('workspace.actions.operator_title')}
          </h2>
          <div className="action-list">
            {actions[role].map((action) => (
              <Button
                key={action}
                className="button secondary action-button"
                onClick={() => {
                  onAction(action);
                  setActionStatus(t('status.workspace_action_saved'));
                }}
              >
                {t(`workspace.actions.${action}`)}
              </Button>
            ))}
          </div>
          {actionStatus && (
            <StatusMessage className="form-status action-status show" intent="success" message={actionStatus} />
          )}
        </section>
      </div>
    </section>
  );
}
