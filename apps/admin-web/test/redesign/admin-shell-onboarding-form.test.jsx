import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n.js';
import { AdminShell } from '../../src/redesign/admin/AdminShell.jsx';

// Interaction coverage for the redesigned onboarding decision form
// (Copilot PR #139 review, finding #3): admin-shell-axe.test.jsx and
// admin-redesign-mount.test.jsx exercise rendering/tone/axe only, never
// the actual gating/payload/read-only-transition semantics that the
// legacy `apps/admin-web/test/OnboardingAdmin.test.jsx`'s "submits a
// decision reason and updates the reviewed application" test already
// covers for the pre-redesign component. This file adapts that same
// coverage for the redesigned `AdminReviewCard` inside `AdminShell.jsx`.
const auth = { account: { name: 'Admin User', username: 'admin@test.keyforta.com' }, status: 'signed-in' };

function renderShell({ mediaReviewApi, onboardingApi, section = 'onboarding' }) {
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

describe('AdminShell onboarding decision form interactions', () => {
  afterEach(() => {
    i18n.changeLanguage('en');
    cleanup();
  });

  it('keeps Approve/Reject disabled until the reason textarea has at least 3 trimmed characters', async () => {
    const onboardingApi = { list: vi.fn().mockResolvedValue([application]) };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    renderShell({ mediaReviewApi, onboardingApi });
    await screen.findByText('Amina K.');

    const textbox = screen.getByRole('textbox', { name: 'Decision reason' });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    fireEvent.change(textbox, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    fireEvent.change(textbox, { target: { value: 'ok' } });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    fireEvent.change(textbox, { target: { value: 'Verified documents' } });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('calls the decision handler with (applicationId, "approved", reason) when Approve is clicked', async () => {
    const decideMock = vi.fn().mockResolvedValue({ ...application, status: 'approved', decisionReason: 'Verified documents', decidedAt: '2026-09-02T11:00:00.000Z' });
    const onboardingApi = { list: vi.fn().mockResolvedValue([application]), decide: decideMock };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    renderShell({ mediaReviewApi, onboardingApi });
    await screen.findByText('Amina K.');

    fireEvent.change(screen.getByRole('textbox', { name: 'Decision reason' }), { target: { value: 'Verified documents' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(decideMock).toHaveBeenCalledWith('app-1', { decision: 'approved', reason: 'Verified documents' }));
    await screen.findByText('Verified documents');
  });

  it('calls the decision handler with (applicationId, "rejected", reason) when Reject is clicked', async () => {
    const decideMock = vi.fn().mockResolvedValue({ ...application, status: 'rejected', decisionReason: 'Missing documents', decidedAt: '2026-09-02T11:00:00.000Z' });
    const onboardingApi = { list: vi.fn().mockResolvedValue([application]), decide: decideMock };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    renderShell({ mediaReviewApi, onboardingApi });
    await screen.findByText('Amina K.');

    fireEvent.change(screen.getByRole('textbox', { name: 'Decision reason' }), { target: { value: 'Missing documents' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(decideMock).toHaveBeenCalledWith('app-1', { decision: 'rejected', reason: 'Missing documents' }));
    await screen.findByText('Missing documents');
  });

  it('renders the decided/read-only view instead of the form once a decision resolves', async () => {
    const decideMock = vi.fn().mockResolvedValue({ ...application, status: 'approved', decisionReason: 'Verified documents', decidedAt: '2026-09-02T11:00:00.000Z' });
    const onboardingApi = { list: vi.fn().mockResolvedValue([application]), decide: decideMock };
    const mediaReviewApi = { list: vi.fn().mockResolvedValue([]) };
    renderShell({ mediaReviewApi, onboardingApi });
    await screen.findByText('Amina K.');

    fireEvent.change(screen.getByRole('textbox', { name: 'Decision reason' }), { target: { value: 'Verified documents' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(decideMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Decision reason' })).not.toBeInTheDocument());
    expect(screen.getByText('Verified documents')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
