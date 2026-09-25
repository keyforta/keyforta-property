import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n.js';
import { AdminShell } from '../../src/redesign/admin/AdminShell.jsx';

// Interaction coverage for the redesigned media-review decision form
// (Copilot PR #139 review, finding #3 — this finding also flagged
// AdminShell.jsx lines 185 and 242, the media-review card/decide
// handler, not just the onboarding form covered by
// admin-shell-onboarding-form.test.jsx). Unlike onboarding, Approve does
// NOT require notes; only Reject does (`canReject = notes.trim().length
// > 0`), and a decided item is filtered out of the queue entirely rather
// than shown read-only (see `AdminMediaReviewQueue`'s `decide()`).
const auth = { account: { name: 'Admin User', username: 'admin@test.keyforta.com' }, status: 'signed-in' };

function renderShell({ mediaReviewApi, onboardingApi }) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <AdminShell
        auth={auth}
        mediaReviewApi={mediaReviewApi}
        onSectionChange={() => {}}
        onSignOut={() => {}}
        onboardingApi={onboardingApi}
        section="media-review"
      />
    </FluentProvider>,
  );
}

const review = {
  imageUrls: [],
  listingId: 'listing-1',
  organizationName: 'Riverside Homes',
  propertyName: 'Riverside Court',
  submittedAt: '2026-09-01T10:00:00.000Z',
  title: 'Sunlit two-bedroom near the park',
  unitLabel: 'Unit 4B',
  uploadedImages: [],
};

describe('AdminShell media-review decision form interactions', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('allows Approve with empty notes but keeps Reject disabled until notes are non-empty', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([review]) };
    renderShell({ mediaReviewApi, onboardingApi });
    await screen.findByText('Sunlit two-bedroom near the park');

    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Reviewer notes' }), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Reviewer notes' }), { target: { value: 'Blurry photo' } });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('calls the decision handler with (listingId, "approved", undefined) when Approve is clicked with no notes', async () => {
    const decideMock = vi.fn().mockResolvedValue(undefined);
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([review]), decide: decideMock };
    renderShell({ mediaReviewApi, onboardingApi });
    await screen.findByText('Sunlit two-bedroom near the park');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(decideMock).toHaveBeenCalledWith('listing-1', { decision: 'approved', notes: undefined }));
  });

  it('calls the decision handler with (listingId, "rejected", notes) when Reject is clicked with notes', async () => {
    const decideMock = vi.fn().mockResolvedValue(undefined);
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([review]), decide: decideMock };
    renderShell({ mediaReviewApi, onboardingApi });
    await screen.findByText('Sunlit two-bedroom near the park');

    fireEvent.change(screen.getByRole('textbox', { name: 'Reviewer notes' }), { target: { value: 'Blurry photo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(decideMock).toHaveBeenCalledWith('listing-1', { decision: 'rejected', notes: 'Blurry photo' }));
  });

  it('removes the review from the queue once a decision resolves (no read-only view, unlike onboarding)', async () => {
    const decideMock = vi.fn().mockResolvedValue(undefined);
    const onboardingApi = { list: vi.fn().mockResolvedValue([]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([review]), decide: decideMock };
    renderShell({ mediaReviewApi, onboardingApi });
    await screen.findByText('Sunlit two-bedroom near the park');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(decideMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Sunlit two-bedroom near the park')).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent(/./);
  });
});
