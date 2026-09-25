import { FluentProvider } from '@fluentui/react-components';
import './redesign.css';
import { ManagerShell } from './ManagerShell.jsx';
import { landlordRedesignTheme } from '../landlord/theme.js';

// docs/product/MANAGER_REDESIGN_SPEC.md §8.1(a): the shared KEYFORTA
// brand theme is imported directly from `../landlord/theme.js`,
// unmodified — it is not landlord-specific content (see that file's own
// header comment), only currently landlord-located; extraction to a
// shared location is an explicitly deferred open question, not decided
// here.
//
// Default export so `React.lazy(() => import('./redesign/manager/index.jsx'))`
// in portal-app.jsx code-splits this entire module (component + theme +
// redesign.css) into its own chunk, mirroring the landlord redesign's
// identical lazy-loading pattern: when `VITE_REDESIGN_ENABLED` is off (or
// the session's role isn't 'manager'), the browser never requests this
// chunk at all.
export default function ManagerRedesign(props) {
  return (
    <FluentProvider theme={landlordRedesignTheme}>
      <ManagerShell {...props} />
    </FluentProvider>
  );
}
