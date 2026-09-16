import { HealthWidget } from '../src/health-widget.js';

export default {
  component: HealthWidget,
  title: 'System/HealthWidget',
};

export const Loading = { args: { locale: 'en', state: { kind: 'loading' } } };
export const Empty = { args: { locale: 'en', state: { kind: 'empty' } } };
export const Populated = { args: { locale: 'en', state: { kind: 'populated' } } };
export const Error = { args: { locale: 'en', state: { kind: 'error' } } };
