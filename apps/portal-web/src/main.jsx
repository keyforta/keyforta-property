import { createRoot } from 'react-dom/client';
import { PortalApp, portalEntrySourceMarker } from './portal-app.jsx';

if (!portalEntrySourceMarker.includes('FluentProvider') || !portalEntrySourceMarker.includes('tenant: {') || !portalEntrySourceMarker.includes('landlord: {') || !portalEntrySourceMarker.includes('manager: {') || !portalEntrySourceMarker.includes('operator: {') || !portalEntrySourceMarker.includes('new URLSearchParams(window.location.search)')) {
  throw new Error('Portal app source marker is incomplete.');
}

createRoot(document.querySelector('#app')).render(<PortalApp />);
