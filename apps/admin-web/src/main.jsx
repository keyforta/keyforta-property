import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { completeBrowserEntraRedirect } from '@keyforta/browser-auth';
import { createRoot } from 'react-dom/client';
import { OnboardingAdmin } from './OnboardingAdmin.jsx';
import './styles.css';

if (window.location.pathname === '/auth/callback') {
  completeBrowserEntraRedirect().catch(() => {
    document.body.textContent = 'Authentication could not be completed. Close this window and try again.';
  });
} else {
  createRoot(document.querySelector('#app')).render(
    <FluentProvider theme={webLightTheme}>
      <OnboardingAdmin />
    </FluentProvider>,
  );
}
