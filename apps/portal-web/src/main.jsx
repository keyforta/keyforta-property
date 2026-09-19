import { completeBrowserEntraRedirect } from '@keyforta/browser-auth';
import { createRoot } from 'react-dom/client';
import i18n from './i18n.js';
import { PortalApp } from './portal-app.jsx';

if (window.location.pathname === '/auth/callback') {
  completeBrowserEntraRedirect().catch(() => {
    document.body.textContent = i18n.t('auth.redirect_failed');
  });
} else {
  createRoot(document.querySelector('#app')).render(<PortalApp />);
}
