import { createElement, useEffect, useId, useRef } from 'react';

import { stringsFor } from './strings.js';

export function HealthWidget({ locale, state }) {
  const strings = stringsFor(locale);
  const heading = useRef(null);
  const descriptionId = useId();
  const titleId = useId();
  useEffect(() => {
    if (state.kind === 'error') heading.current?.focus();
  }, [state.kind]);

  const text = state.kind === 'loading' ? strings.loading
    : state.kind === 'empty' ? strings.empty
      : state.kind === 'error' ? strings.error
        : strings.healthy;
  return createElement('section', {
    'aria-busy': state.kind === 'loading',
    'aria-describedby': descriptionId,
    'aria-labelledby': titleId,
    className: `health-widget health-widget--${state.kind}`,
  },
  createElement('h1', { id: titleId, ref: heading, tabIndex: -1 }, strings.title),
  createElement('p', { id: descriptionId }, strings.description),
  createElement('output', { 'aria-label': strings.title, role: state.kind === 'error' ? 'alert' : 'status' }, text));
}
