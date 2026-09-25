import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import i18n from '../../src/i18n.js';
import { ManagerShell } from '../../src/redesign/manager/ManagerShell.jsx';
import { managerListingsFixture } from '../../src/redesign/manager/__fixtures__/managerListingsFixture.js';

// Mirrors test/redesign/landlord-shell-axe.test.jsx's coverage for the
// new `ManagerShell` composition (docs/product/MANAGER_REDESIGN_SPEC.md).
function renderShell({ active = 'portfolio', managerListings }) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ManagerShell
        active={active}
        completedAction=''
        listingPublicationEmptyState='No listings are currently assigned to you.'
        managerListings={managerListings}
        managerListingsError={null}
        managerListingsLoading={false}
        navKeys={['overview', 'portfolio']}
        onComplete={() => {}}
        onLogout={() => {}}
        onSetActive={() => {}}
        onToggleLanguage={() => {}}
        retryManagerListings={() => {}}
        role={{
          eyebrow: 'Operations workspace',
          title: 'Coordinate the work behind every home.',
          summary: 'Operate the assigned portfolio.',
          nav: ['Overview', 'Portfolio'],
          statsEmptyState: 'Stats unavailable.',
          rowsEmptyState: 'Nothing needs attention yet.',
        }}
        roleActions={['Publish a listing']}
        session={{ email: 'demo.manager@test.keyforta.com', role: 'manager', sessionMode: 'demo' }}
        showListingPublication
      />
    </FluentProvider>,
  );
}

describe('ManagerShell (flag on) accessibility smoke', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('has no critical accessibility violations in the empty state (no assigned listings yet)', async () => {
    const { container } = renderShell({ managerListings: [] });
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no critical accessibility violations with a populated fixture (mixed listing statuses, status legend)', async () => {
    const { container } = renderShell({ managerListings: managerListingsFixture });
    expect((await axe(container)).violations).toEqual([]);
  });
});
