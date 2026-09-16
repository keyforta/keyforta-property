import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { HealthWidget } from './health-widget.js';
import './styles.css';

createRoot(document.getElementById('root')).render(
  createElement(HealthWidget, { locale: 'en', state: { kind: 'populated' } }),
);
