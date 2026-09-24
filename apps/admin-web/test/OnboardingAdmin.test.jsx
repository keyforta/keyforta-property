import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authState: { current: { status: 'signed-out' } },
  listMock: vi.fn(),
  decideMock: vi.fn(),
  mediaReviewListMock: vi.fn(),
  mediaReviewDecideMock: vi.fn(),
  getReviewImageContentMock: vi.fn(),
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
  initializeMock: vi.fn(),
}));

vi.mock('@keyforta/browser-auth', () => ({
  createBrowserEntraAuth: () => ({
    subscribe: (cb) => { cb(); return () => {}; },
    getSnapshot: () => mocks.authState.current,
    initialize: mocks.initializeMock,
    signIn: mocks.signInMock,
    signOut: mocks.signOutMock,
    getAccessToken: vi.fn(),
  }),
}));

vi.mock('../src/onboarding-api.js', () => ({
  createOnboardingApi: () => ({
    list: mocks.listMock,
    decide: mocks.decideMock,
  }),
  resolveAdminApiBaseUrl: () => 'https://admin-api.test',
}));

vi.mock('../src/media-review-api.js', () => ({
  createMediaReviewApi: () => ({
    list: mocks.mediaReviewListMock,
    decide: mocks.mediaReviewDecideMock,
    getReviewImageContent: mocks.getReviewImageContentMock,
  }),
}));

import { OnboardingAdmin } from '../src/OnboardingAdmin.jsx';
import i18n from '../src/i18n.js';

function renderAdmin() {
  return render(<FluentProvider theme={webLightTheme}><OnboardingAdmin /></FluentProvider>);
}

const application = {
  id: 'app-1', applicantName: 'Amina K.', proposedOrganizationName: 'Riverside Homes', submittedAt: '2026-09-01T10:00:00.000Z', status: 'pending', decisionReason: ''
};

describe('OnboardingAdmin', () => {
  beforeEach(() => {
    mocks.authState.current = { status: 'signed-in', account: { name: 'Admin User', username: 'admin@test.keyforta.com' } };
    mocks.listMock.mockReset();
    mocks.decideMock.mockReset();
    mocks.mediaReviewListMock.mockReset();
    mocks.mediaReviewDecideMock.mockReset();
    mocks.getReviewImageContentMock.mockReset();
    mocks.signInMock.mockReset();
    mocks.signOutMock.mockReset();
    mocks.initializeMock.mockReset();
    i18n.changeLanguage('en');
  });

  it('renders a loading queue state before applications load', () => {
    mocks.listMock.mockImplementation(() => new Promise(() => {}));
    renderAdmin();
    expect(screen.getByText('Loading applications...')).toBeInTheDocument();
  });

  it('renders the empty state when no applications are awaiting review', async () => {
    mocks.listMock.mockResolvedValue([]);
    renderAdmin();
    expect(await screen.findByText('No onboarding applications are awaiting review.')).toBeInTheDocument();
  });

  it('renders an access denied state for unauthorized reviewers', async () => {
    mocks.listMock.mockRejectedValue({ status: 404 });
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(screen.getByText('This identity is not authorized to review onboarding applications.')).toBeInTheDocument();
  });

  it('renders an error state when the queue cannot load', async () => {
    mocks.listMock.mockRejectedValue({ code: 'API_UNAVAILABLE' });
    renderAdmin();
    expect(await screen.findByRole('alert')).toHaveTextContent('The admin API is not configured.');
  });

  it('submits a decision reason and updates the reviewed application', async () => {
    mocks.listMock.mockResolvedValue([application]);
    mocks.decideMock.mockResolvedValue({ ...application, status: 'approved', decisionReason: 'Verified documents', decidedAt: '2026-09-02T11:00:00.000Z' });
    renderAdmin();
    const textbox = await screen.findByRole('textbox', { name: 'Decision reason' });
    fireEvent.change(textbox, { target: { value: 'Verified documents' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(mocks.decideMock).toHaveBeenCalledWith('app-1', { decision: 'approved', reason: 'Verified documents' }));
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Verified documents')).toBeInTheDocument();
  });

  it('has no critical accessibility violations for the signed-out gate', async () => {
    mocks.authState.current = { status: 'signed-out' };
    const { container } = renderAdmin();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('switches the console to French when the language toggle is used', async () => {
    mocks.listMock.mockResolvedValue([]);
    renderAdmin();
    await screen.findByText('No onboarding applications are awaiting review.');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to French' }));
    expect(await screen.findByText("Aucune demande d'accueil n'est en attente d'examen.")).toBeInTheDocument();
  });

  it('translates the application status badge instead of showing the raw API value', async () => {
    mocks.listMock.mockResolvedValue([application]);
    renderAdmin();
    await screen.findByText('Amina K.');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to French' }));
    expect(await screen.findByText('En attente')).toBeInTheDocument();
    expect(screen.queryByText('pending')).not.toBeInTheDocument();
  });

  describe('media-review section (REQ-037)', () => {
    const pendingReview = {
      listingId: 'listing-1',
      organizationId: 'org-1',
      organizationName: 'Riverside Homes',
      unitId: 'unit-1',
      unitLabel: 'Unit 2A',
      propertyName: 'Riverside Apartments',
      title: 'Riverside apartment — Unit 2A',
      summary: 'A bright two-bedroom unit close to transit.',
      imageUrls: ['https://images.test/a.jpg'],
      submittedAt: '2026-09-01T10:00:00.000Z',
    };

    it('switches to the media-review queue and loads pending reviews', async () => {
      mocks.listMock.mockResolvedValue([]);
      mocks.mediaReviewListMock.mockResolvedValue([pendingReview]);
      renderAdmin();
      await screen.findByText('No onboarding applications are awaiting review.');

      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));

      expect(await screen.findByText('Riverside apartment — Unit 2A')).toBeInTheDocument();
      expect(screen.getByText('Riverside Apartments')).toBeInTheDocument();
      expect(screen.getByText('Unit 2A')).toBeInTheDocument();
    });

    it('does not render a clickable link for a legacy imageUrls value using an unsafe URL scheme', async () => {
      mocks.listMock.mockResolvedValue([]);
      mocks.mediaReviewListMock.mockResolvedValue([{
        ...pendingReview,
        imageUrls: ['javascript:alert(1)', 'https://images.test/a.jpg'],
      }]);
      renderAdmin();
      await screen.findByText('No onboarding applications are awaiting review.');

      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));

      await screen.findByText('Riverside apartment — Unit 2A');
      expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'https://images.test/a.jpg' })).toBeInTheDocument();
    });

    it('renders the empty state when no listings are awaiting media review', async () => {
      mocks.listMock.mockResolvedValue([]);
      mocks.mediaReviewListMock.mockResolvedValue([]);
      renderAdmin();
      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
      expect(await screen.findByText('No public listings are awaiting media review.')).toBeInTheDocument();
    });

    it('renders an access-denied state for a non-allowlisted identity', async () => {
      mocks.listMock.mockResolvedValue([]);
      mocks.mediaReviewListMock.mockRejectedValue({ status: 404 });
      renderAdmin();
      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
      expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
      expect(screen.getByText('This identity is not authorized to review public-listing media.')).toBeInTheDocument();
    });

    it('approves a listing and removes it from the queue', async () => {
      mocks.listMock.mockResolvedValue([]);
      mocks.mediaReviewListMock.mockResolvedValue([pendingReview]);
      mocks.mediaReviewDecideMock.mockResolvedValue({ listingId: 'listing-1', mediaReviewStatus: 'approved' });
      renderAdmin();
      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
      await screen.findByText('Riverside apartment — Unit 2A');

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => expect(mocks.mediaReviewDecideMock).toHaveBeenCalledWith('listing-1', { decision: 'approved', notes: undefined }));
      expect(screen.queryByText('Riverside apartment — Unit 2A')).not.toBeInTheDocument();
      expect(await screen.findByText('No public listings are awaiting media review.')).toBeInTheDocument();
    });

    it('requires notes before rejecting a listing', async () => {
      mocks.listMock.mockResolvedValue([]);
      mocks.mediaReviewListMock.mockResolvedValue([pendingReview]);
      renderAdmin();
      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
      await screen.findByText('Riverside apartment — Unit 2A');

      expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
      fireEvent.change(screen.getByRole('textbox', { name: 'Reviewer notes' }), { target: { value: 'Photos are too dark to evaluate.' } });
      expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
    });

    it('rejects a listing with reviewer notes and removes it from the queue', async () => {
      mocks.listMock.mockResolvedValue([]);
      mocks.mediaReviewListMock.mockResolvedValue([pendingReview]);
      mocks.mediaReviewDecideMock.mockResolvedValue({ listingId: 'listing-1', mediaReviewStatus: 'rejected' });
      renderAdmin();
      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
      await screen.findByText('Riverside apartment — Unit 2A');

      fireEvent.change(screen.getByRole('textbox', { name: 'Reviewer notes' }), { target: { value: 'Photos are too dark to evaluate.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

      await waitFor(() => expect(mocks.mediaReviewDecideMock).toHaveBeenCalledWith('listing-1', { decision: 'rejected', notes: 'Photos are too dark to evaluate.' }));
      expect(await screen.findByText('No public listings are awaiting media review.')).toBeInTheDocument();
    });

    it('returns to the onboarding queue when its tab is reselected', async () => {
      mocks.listMock.mockResolvedValue([application]);
      mocks.mediaReviewListMock.mockResolvedValue([]);
      renderAdmin();
      await screen.findByText('Amina K.');

      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
      await screen.findByText('No public listings are awaiting media review.');

      fireEvent.click(screen.getByRole('button', { name: 'Onboarding' }));
      expect(await screen.findByText('Amina K.')).toBeInTheDocument();
    });

    describe('uploaded images (fixes the REQ-038 review-visibility gap)', () => {
      const uploadedImageReview = {
        ...pendingReview,
        imageUrls: [],
        uploadedImages: [{ imageId: 'image-1', mediaType: 'image/png', position: 0, room: 'living' }],
      };

      it('fetches and renders an uploaded image using the admin review-content route', async () => {
        mocks.listMock.mockResolvedValue([]);
        mocks.mediaReviewListMock.mockResolvedValue([uploadedImageReview]);
        mocks.getReviewImageContentMock.mockResolvedValue('blob:https://admin-api.test/review-image');
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
        await screen.findByText('Riverside apartment — Unit 2A');

        await waitFor(() => expect(mocks.getReviewImageContentMock).toHaveBeenCalledWith('listing-1', 'image-1'));
        const image = await screen.findByRole('img', { name: 'Living room' });
        expect(image).toHaveAttribute('src', 'blob:https://admin-api.test/review-image');
      });

      it('shows an error message instead of a broken image when review content fails to load', async () => {
        mocks.listMock.mockResolvedValue([]);
        mocks.mediaReviewListMock.mockResolvedValue([uploadedImageReview]);
        mocks.getReviewImageContentMock.mockRejectedValue({ status: 404 });
        renderAdmin();
        fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
        await screen.findByText('Riverside apartment — Unit 2A');

        expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'Living room' })).not.toBeInTheDocument();
      });
    });

    it('has no critical accessibility violations on the media-review queue', async () => {
      mocks.listMock.mockResolvedValue([]);
      mocks.mediaReviewListMock.mockResolvedValue([pendingReview]);
      const { container } = renderAdmin();
      fireEvent.click(screen.getByRole('button', { name: 'Media review' }));
      await screen.findByText('Riverside apartment — Unit 2A');
      expect((await axe(container)).violations).toEqual([]);
    });
  });
});
