import { useState } from 'react';
import AdminRedesign from '../index.jsx';
import {
  createPreviewMediaReviewApi,
  createPreviewOnboardingApi,
  previewAuth,
} from './previewFixtures.js';

// Dev-only visual/E2E-QA harness (not part of the production entry point/
// bundle — see admin-redesign-preview.html, which is never referenced by
// index.html or vite.config.js's default single-page build). Renders the
// exact same `AdminRedesign` → `AdminShell` production component tree
// used in production, with fixture `onboardingApi`/`mediaReviewApi`
// stand-ins (see previewFixtures.js) in place of the real, already-
// authenticated singletons `OnboardingAdmin.jsx` normally passes down —
// this preview intentionally bypasses real Entra sign-in entirely (Admin
// has no `?role=`-style dev bypass, and does not need one; the flag/
// LoginGate mechanism itself is unchanged by this redesign and is already
// covered by admin-redesign-mount.test.jsx), for Playwright screenshot
// capture during this phase's verification only.
const onboardingApi = createPreviewOnboardingApi();
const mediaReviewApi = createPreviewMediaReviewApi();

export function AdminPreview() {
  const [section, setSection] = useState('onboarding');
  return (
    <AdminRedesign
      auth={previewAuth}
      mediaReviewApi={mediaReviewApi}
      onSectionChange={setSection}
      onSignOut={() => {}}
      onboardingApi={onboardingApi}
      section={section}
    />
  );
}
