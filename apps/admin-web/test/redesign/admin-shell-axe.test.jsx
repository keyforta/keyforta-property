import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import i18n from '../../src/i18n.js';
import { AdminShell } from '../../src/redesign/admin/AdminShell.jsx';

// Mirrors apps/portal-web/test/redesign/manager-shell-axe.test.jsx's
// coverage for the new `AdminShell` composition
// (docs/product/ADMIN_REDESIGN_SPEC.md). Admin's two genuinely
// data-bearing sections (§0(1)) are each exercised in both an empty and a
// populated state, unlike Tenant's single generic-empty-state coverage.
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

describe('AdminShell (flag on) accessibility smoke', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('has no critical accessibility violations on the empty onboarding queue', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    const { container } = renderShell({ mediaReviewApi, onboardingApi, section: 'onboarding' });
    await screen.findByText('No onboarding applications are awaiting review.');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no critical accessibility violations on the populated onboarding queue', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([application]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    const { container } = renderShell({ mediaReviewApi, onboardingApi, section: 'onboarding' });
    await screen.findByText('Amina K.');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no critical accessibility violations on the empty media-review queue', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    const { container } = renderShell({ mediaReviewApi, onboardingApi, section: 'media-review' });
    await screen.findByText('No public listings are awaiting media review.');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no critical accessibility violations on the populated media-review queue', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([mediaReview]) };
    const { container } = renderShell({ mediaReviewApi, onboardingApi, section: 'media-review' });
    await screen.findByText('Riverside apartment — Unit 2A');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no critical accessibility violations after typing a required decision reason on a pending application', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([application]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    const { container } = renderShell({ mediaReviewApi, onboardingApi, section: 'onboarding' });
    await screen.findByText('Amina K.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Decision reason' }), { target: { value: 'Verified documents' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled());
    expect((await axe(container)).violations).toEqual([]);
  });
});
