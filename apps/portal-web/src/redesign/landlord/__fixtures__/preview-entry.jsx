import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../i18n.js';
// Same global stylesheet portal-app.jsx already imports (side-effect
// import only — this file never edits styles.css). Required here because
// this preview intentionally bypasses portal-app.jsx entirely (it mounts
// `LandlordRedesign` directly with fixture data), and several of the
// reused panels' base layout rules (e.g. `.unit-row`'s grid) live only in
// this stylesheet, not in redesign.css, which only ever restyles already-
// laid-out elements rather than re-establishing their base display/grid
// rules from scratch.
import '../../../styles.css';
import { PoRegressionPreview } from './PoRegressionPreview.jsx';

// Standalone dev-only mount, paired with
// src/landlord-redesign-preview.html (see that file for why this never
// ships in the production build). `vite dev`'s default static file
// serving picks this html file up directly at
// /landlord-redesign-preview.html without any vite.config.js changes.
createRoot(document.querySelector('#app')).render(
  <I18nextProvider i18n={i18n}>
    <PoRegressionPreview />
  </I18nextProvider>,
);
