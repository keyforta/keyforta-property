import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { completeBrowserEntraRedirect } from '@keyforta/browser-auth';
import { createRoot } from 'react-dom/client';
import i18n from './i18n.js';
import { OnboardingAdmin } from './OnboardingAdmin.jsx';
import './styles.css';

if (window.location.pathname === '/auth/callback') {
  completeBrowserEntraRedirect().catch(() => {
    document.body.textContent = i18n.t('auth.redirect_failed');
  });
} else {
  createRoot(document.querySelector('#app')).render(
    <FluentProvider theme={webLightTheme}>
      <OnboardingAdmin />
    </FluentProvider>,
  );
}
