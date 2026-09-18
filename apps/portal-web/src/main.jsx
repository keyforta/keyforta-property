import { completeBrowserEntraRedirect } from '@keyforta/browser-auth';
import { createRoot } from 'react-dom/client';
import { PortalApp } from './portal-app.jsx';

if (window.location.pathname === '/auth/callback') {
  completeBrowserEntraRedirect().catch(() => {
    document.body.textContent = 'Authentication could not be completed. Close this window and try again.';
  });
} else {
  createRoot(document.querySelector('#app')).render(<PortalApp />);
}
