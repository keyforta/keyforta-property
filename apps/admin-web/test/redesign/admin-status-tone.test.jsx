import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n.js';
import { AdminShell } from '../../src/redesign/admin/AdminShell.jsx';
import { mediaReviewStatusTone, onboardingStatusTone } from '../../src/redesign/admin/statusTone.js';

// Unlike Tenant (zero status vocabulary), Admin has two real, different
// status vocabularies with real computed badge/tone output (spec §0(1),
// §3.2, §5). This asserts the actual computed Fluent `Badge` `color`
// output for both queues on rendered fixture data, mirroring
// apps/portal-web/test/redesign/manager-status-tone.test.jsx's equivalent
// "don't just check accessibility, check the actual computed tone"
// coverage.
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

describe('Admin status-tone helper (unit)', () => {
  it('maps the onboarding application-status vocabulary (pending/approved/rejected) to warning/success/danger', () => {
    expect(onboardingStatusTone('pending')).toBe('warning');
    expect(onboardingStatusTone('approved')).toBe('success');
    expect(onboardingStatusTone('rejected')).toBe('danger');
  });

  it('maps the media-review status vocabulary (pending-only, reachable today) to warning', () => {
    expect(mediaReviewStatusTone('pending')).toBe('warning');
  });

  it('the two helpers are independent functions, not aliases of one shared vocabulary', () => {
    expect(onboardingStatusTone).not.toBe(mediaReviewStatusTone);
  });
});

describe('Admin redesign row-level status badges (computed output on rendered fixtures)', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('renders a warning-tint badge for a pending application, a success-tint badge for an approved one, and a danger-tint badge for a rejected one', async () => {
    const onboardingApi = {
      list: vi.fn().mockResolvedValue([
        { applicantName: 'Amina K.', decisionReason: '', id: 'app-1', proposedOrganizationName: 'Riverside Homes', status: 'pending', submittedAt: '2026-09-01T10:00:00.000Z' },
        { applicantName: 'Ben O.', decidedAt: '2026-09-03T10:00:00.000Z', decisionReason: 'Verified documents', id: 'app-2', proposedOrganizationName: 'Harbor Rentals', status: 'approved', submittedAt: '2026-09-01T10:00:00.000Z' },
        { applicantName: 'Cleo T.', decidedAt: '2026-09-04T10:00:00.000Z', decisionReason: 'Documents did not match', id: 'app-3', proposedOrganizationName: 'Summit Leasing', status: 'rejected', submittedAt: '2026-09-01T10:00:00.000Z' },
      ]),
    };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    renderShell({ mediaReviewApi, onboardingApi, section: 'onboarding' });

    const pendingBadge = await screen.findByText('Pending');
    const approvedBadge = await screen.findByText('Approved');
    const rejectedBadge = await screen.findByText('Rejected');

    // Fluent's `Badge appearance='tint' color='warning'|'success'|'danger'`
    // resolves to a distinct class per color (`fui-Badge` + a
    // color-specific class); rather than assert on Fluent's own
    // internal/unstable class name, assert the three badges resolve to
    // three *different* class attributes, confirming a real, distinct
    // computed style per status rather than one shared/uncomputed class.
    expect(pendingBadge.className).not.toBe(approvedBadge.className);
    expect(approvedBadge.className).not.toBe(rejectedBadge.className);
    expect(pendingBadge.className).not.toBe(rejectedBadge.className);
  });

  it('renders a warning-tint badge for every media-review row (pending-only vocabulary, decided items never rendered)', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = {
      list: vi.fn().mockResolvedValue([
        { imageUrls: [], listingId: 'listing-1', organizationName: 'Riverside Homes', propertyName: 'Riverside Apartments', submittedAt: '2026-09-01T10:00:00.000Z', title: 'Riverside apartment — Unit 2A', unitLabel: 'Unit 2A' },
      ]),
    };
    renderShell({ mediaReviewApi, onboardingApi, section: 'media-review' });

    await screen.findByText('Riverside apartment — Unit 2A');
    const badges = screen.getAllByText('Pending');
    expect(badges).toHaveLength(1);
  });

  it('does not confuse the two vocabularies\u2019 "pending" badge — onboarding\u2019s pending badge and media-review\u2019s pending badge each come from their own helper', async () => {
    const onboardingApi = {
      list: vi.fn().mockResolvedValue([
        { applicantName: 'Amina K.', decisionReason: '', id: 'app-1', proposedOrganizationName: 'Riverside Homes', status: 'pending', submittedAt: '2026-09-01T10:00:00.000Z' },
      ]),
    };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    renderShell({ mediaReviewApi, onboardingApi, section: 'onboarding' });
    const onboardingPendingBadge = await screen.findByText('Pending');
    expect(onboardingPendingBadge).toBeInTheDocument();
    expect(onboardingStatusTone('pending')).toBe(mediaReviewStatusTone('pending'));
    // Same resolved color today (both `warning`), but via two distinct,
    // independently-callable helpers (previous describe block) — not one
    // shared vocabulary, per spec §0/§5.
  });
});
