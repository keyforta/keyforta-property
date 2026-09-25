import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import i18n from '../../src/i18n.js';
import { TenantShell } from '../../src/redesign/tenant/TenantShell.jsx';

// Mirrors test/redesign/manager-shell-axe.test.jsx's coverage for the new
// `TenantShell` composition (docs/product/TENANT_REDESIGN_SPEC.md). Tenant
// has no populated/empty distinction to exercise (no data-bearing panel
// exists at all, spec §0/§1), so — unlike Landlord's/Manager's paired
// empty/populated fixture cases — there is exactly one rendered state per
// nav tab; this suite instead varies the *active tab* to independently
// confirm accessibility across all six of Tenant's nav destinations
// (spec §4.3-§4.8's uniform generic empty-state treatment).
function renderShell({ active }) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <TenantShell
        active={active}
        completedAction=''
        navKeys={['overview', 'lease', 'payments', 'maintenance', 'documents', 'messages']}
        onComplete={() => {}}
        onLogout={() => {}}
        onSetActive={() => {}}
        onToggleLanguage={() => {}}
        role={{
          eyebrow: 'My rental',
          title: 'Everything about your home, in one place.',
          summary: 'Track your application, lease, payments, maintenance, documents, and messages.',
          nav: ['Overview', 'My lease', 'Payments', 'Maintenance', 'Documents', 'Messages'],
          statsEmptyState: 'Lease, payment, and maintenance summaries will appear here once the tenant read APIs are available.',
          rowsEmptyState: 'Recent maintenance, payment, and message activity will appear here once the tenant read APIs are available.',
        }}
        roleActions={['Report a maintenance issue', 'Upload a document', 'Message manager']}
        session={{ email: 'demo.tenant@test.keyforta.com', role: 'tenant', sessionMode: 'demo' }}
      />
    </FluentProvider>,
  );
}

describe('TenantShell (flag on) accessibility smoke', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it.each(['overview', 'lease', 'payments', 'maintenance', 'documents', 'messages'])(
    'has no critical accessibility violations on the "%s" tab (shared generic empty state)',
    async (active) => {
      const { container } = renderShell({ active });
      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
