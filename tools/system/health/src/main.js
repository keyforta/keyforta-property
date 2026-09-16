import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createWidgetBridge } from '@keyforta/ui-core';

import { HealthWidget } from './health-widget.js';
import './styles.css';

if (document.referrer) {
  let origin;
  try {
    const referrer = new URL(document.referrer);
    origin = referrer.protocol === 'https:' ? referrer.origin : undefined;
  } catch {
    origin = undefined;
  }
  if (origin) {
    createWidgetBridge({
      origin,
      resourceUri: 'ui://keyforta/system/health',
      window,
    }).ready();
  }
}

createRoot(document.getElementById('root')).render(
  createElement(HealthWidget, { locale: 'en', state: { kind: 'populated' } }),
);
