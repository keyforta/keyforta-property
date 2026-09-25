import { FluentProvider } from '@fluentui/react-components';
import { AdminShell } from './AdminShell.jsx';
import './redesign.css';
import { adminRedesignTheme } from './theme.js';

// Default export so `React.lazy(() => import('./redesign/admin/index.jsx'))`
// in `OnboardingAdmin.jsx` code-splits this entire module (component +
// theme + redesign.css) into its own chunk, mirroring the Landlord/
// Manager/Tenant redesigns' identical lazy-loading pattern: when
// `VITE_REDESIGN_ENABLED` is off (or the session is not `signed-in`), the
// browser never requests this chunk at all.
export default function AdminRedesign(props) {
  return (
    <FluentProvider theme={adminRedesignTheme}>
      <AdminShell {...props} />
    </FluentProvider>
  );
}
