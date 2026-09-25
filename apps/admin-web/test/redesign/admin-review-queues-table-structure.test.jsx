import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n.js';
import { AdminShell } from '../../src/redesign/admin/AdminShell.jsx';

// PO feedback (post-#139 polish): both decision queues rendered as
// non-semantic `<article>` cards instead of real tables, so screen-reader
// users had no row/column-header relationship and sighted users had no
// aligned columns, unlike every other list in the redesign (see the
// Fluent UI table reference: https://storybooks.fluentui.dev/react/?path
// =/docs/components-table--docs). This asserts the queues now render as
// genuine `role="table"` structures with real column headers, matching
// the same convention already covered for portal-web's lists.
const auth = { account: { name: 'Admin User', username: 'admin@test.keyforta.com' }, status: 'signed-in' };

function renderShell({ mediaReviewApi, onboardingApi, section }) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <AdminShell
        auth={auth}
        mediaReviewApi={mediaReviewApi}
        onSectionChange={() => {}}
        onSignOut={() => {}}
        onboardingApi={onboardingApi}
        section={section}
      />
    </FluentProvider>,
  );
}

const application = {
  applicantName: 'Amina K.',
  decisionReason: '',
  id: 'app-1',
  proposedOrganizationName: 'Riverside Homes',
  status: 'pending',
  submittedAt: '2026-09-01T10:00:00.000Z',
};

const mediaReview = {
  imageUrls: ['https://images.test/a.jpg'],
  listingId: 'listing-1',
  organizationName: 'Riverside Homes',
  propertyName: 'Riverside Apartments',
  submittedAt: '2026-09-01T10:00:00.000Z',
  title: 'Riverside apartment — Unit 2A',
  unitLabel: 'Unit 2A',
};

describe('AdminShell decision queues render as real tables', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('renders the onboarding queue as a table with an Applicant column header and a data row', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([application]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    renderShell({ mediaReviewApi, onboardingApi, section: 'onboarding' });

    const table = await screen.findByRole('table');
    expect(table).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Applicant' })).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.getByText('Amina K.')).toBeInTheDocument();
  });

  it('renders the media-review queue as a table with a Listing column header and a data row', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([mediaReview]) };
    renderShell({ mediaReviewApi, onboardingApi, section: 'media-review' });

    const table = await screen.findByRole('table');
    expect(table).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Listing' })).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.getByText('Riverside apartment — Unit 2A')).toBeInTheDocument();
  });
});
