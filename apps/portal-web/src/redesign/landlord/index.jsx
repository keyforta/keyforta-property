import { FluentProvider } from '@fluentui/react-components';
import './redesign.css';
import { LandlordShell } from './LandlordShell.jsx';
import { landlordRedesignTheme } from './theme.js';

// Default export so `React.lazy(() => import('./redesign/landlord/index.jsx'))`
// in portal-app.jsx code-splits this entire module (component + theme +
// redesign.css + LandlordShell.jsx's own locale-registration side effect,
// see that file) into its own chunk: when `VITE_REDESIGN_ENABLED` is off,
// the browser never requests this chunk at all (verifiable via network
// inspection, per REQUIREMENTS_GAPS.md acceptance criterion 1).
//
// Nesting a second `FluentProvider` here (the app is already wrapped in one
// with `webLightTheme` by `PortalApp()`) is Fluent v9's supported,
// documented pattern for theming a subtree independently of its ancestor —
// see https://react.fluentui.dev/?path=/docs/theme-customize-theme--docs.
export default function LandlordRedesign(props) {
  return (
    <FluentProvider theme={landlordRedesignTheme}>
      <LandlordShell {...props} />
    </FluentProvider>
  );
}
