import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../src/i18n.js';
import { ManagerShell } from '../../src/redesign/manager/ManagerShell.jsx';
import { managerListingsFixture } from '../../src/redesign/manager/__fixtures__/managerListingsFixture.js';

// Copilot review finding on PR #137: the Manager-specific neutral-tone
// path (redesign/manager/statusTone.js) had no assertion that a rendered
// row actually ends up with the tone the status legend (and
// redesign.css) promise — only accessibility was checked against the
// populated fixture, and the e2e fixture renders an empty portfolio, so
// a regression in either the negative or the neutral pass could silently
// break which color a real row shows while every existing test kept
// passing. This asserts the computed `data-kf-tone` attribute directly
// against the mixed-status fixture (draft/published/withdrawn), mirroring
// `test/redesign/status-label-distinction.test.jsx`'s equivalent
// Landlord coverage for the shared helper.
function renderShell({ managerListings }) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ManagerShell
        active='portfolio'
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

describe('Manager redesign row-level status tone (PR #137 review regression fix)', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('annotates a draft listing row as neutral, a withdrawn row as negative, and leaves a published row untouched', async () => {
    const { container, findAllByText } = renderShell({ managerListings: managerListingsFixture });

    // The legend (PortfolioStatusLegend) renders the same three badge
    // labels via `StatusBadge` (className `kf-badge...`), so each label
    // resolves to two elements: the legend swatch and the real row. Only
    // `.status`-classed elements are the real, per-row badges these
    // helpers annotate; the legend's `StatusBadge` is never touched by
    // either tone helper (see PortfolioStatusLegend.jsx).
    const findRowBadge = async (label) => {
      const matches = await findAllByText(label);
      const rowBadge = matches.find((element) => element.classList.contains('status'));
      expect(rowBadge).toBeTruthy();
      return rowBadge;
    };

    const draftBadge = await findRowBadge(i18n.t('listing_publication.status.draft.badge'));
    const publishedBadge = await findRowBadge(i18n.t('listing_publication.status.published.badge'));
    const withdrawnBadge = await findRowBadge(i18n.t('listing_publication.status.withdrawn.badge'));

    expect(draftBadge).toHaveAttribute('data-kf-tone', 'neutral');
    expect(withdrawnBadge).toHaveAttribute('data-kf-tone', 'negative');
    expect(publishedBadge).not.toHaveAttribute('data-kf-tone');

    // Sanity check: exactly one row of each status is present in the
    // fixture, so this asserts real row content, not the legend (which
    // renders the same three badge labels but is not annotated by the
    // per-row tone helpers — it uses `StatusBadge`'s own explicit `tone`
    // prop instead, see PortfolioStatusLegend.jsx).
    expect(container.querySelectorAll("[data-kf-tone='neutral']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-kf-tone='negative']")).toHaveLength(1);
  });
});
