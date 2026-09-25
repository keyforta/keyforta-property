import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../i18n.js';
// Same global stylesheet main.jsx already imports (side-effect import
// only — this file never edits styles.css). Required here because this
// preview intentionally bypasses main.jsx/OnboardingAdmin.jsx entirely
// (it mounts `AdminRedesign` directly with fixture data).
import '../../../styles.css';
import { AdminPreview } from './AdminPreview.jsx';

// Standalone dev-only mount, paired with
// src/admin-redesign-preview.html (see that file for why this never
// ships in the production build). `vite dev`/`vite preview`'s default
// static file serving picks this html file up directly at
// /admin-redesign-preview.html without any vite.config.js changes.
createRoot(document.querySelector('#app')).render(
  <I18nextProvider i18n={i18n}>
    <AdminPreview />
  </I18nextProvider>,
);
