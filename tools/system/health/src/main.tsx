import { createRoot } from 'react-dom/client';
import { HealthWidget, type HealthWidgetState } from './HealthWidget.js';

declare global {
  interface Window {
    openai?: {
      readonly locale?: string;
      readonly toolOutput?: {
        readonly checkedAt?: string;
        readonly status?: string;
      };
    };
  }
}

function initialState(): HealthWidgetState {
  const output = window.openai?.toolOutput;
  if (!output) return { kind: 'loading' };
  if (output.status === 'healthy' && output.checkedAt) {
    return { checkedAt: output.checkedAt, kind: 'populated' };
  }
  return { kind: 'empty' };
}

const root = document.getElementById('root');
if (!root) throw new Error('Widget root element is missing');

createRoot(root).render(
  <HealthWidget
    {...(window.openai?.locale ? { locale: window.openai.locale } : {})}
    state={initialState()}
  />,
);