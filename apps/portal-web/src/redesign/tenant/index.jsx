import { FluentProvider } from '@fluentui/react-components';
import './redesign.css';
import { TenantShell } from './TenantShell.jsx';
import { landlordRedesignTheme } from '../landlord/theme.js';

// docs/product/TENANT_REDESIGN_SPEC.md §8.1(a): the shared KEYFORTA brand
// theme is imported directly from `../landlord/theme.js`, unmodified — it
// is not landlord-specific content (see that file's own header comment),
// only currently landlord-located; extraction to a shared location is an
// explicitly deferred open question (spec §8a), not decided here, and
// this is the same choice already made by Manager (Manager §8.1(a)).
//
// Default export so `React.lazy(() => import('./redesign/tenant/index.jsx'))`
// in portal-app.jsx code-splits this entire module (component + theme +
// redesign.css) into its own chunk, mirroring the Landlord/Manager
// redesigns' identical lazy-loading pattern: when `VITE_REDESIGN_ENABLED`
// is off (or the session's role isn't 'tenant'), the browser never
// requests this chunk at all.
export default function TenantRedesign(props) {
  return (
    <FluentProvider theme={landlordRedesignTheme}>
      <TenantShell {...props} />
    </FluentProvider>
  );
}
