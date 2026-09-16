import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import { HealthWidget } from '../src/health-widget.js';
import { stringsFor } from '../src/strings.js';

test('localizes deterministically with an English fallback', () => {
  assert.equal(stringsFor('fr-CD').healthy, 'Disponible');
  assert.equal(stringsFor('unsupported').healthy, 'Available');
});

for (const state of ['loading', 'empty', 'populated', 'error']) {
  test(`renders the ${state} accessible widget state`, () => {
    const html = renderToStaticMarkup(
      createElement(HealthWidget, { locale: 'en', state: { kind: state } }),
    );
    assert.match(html, /aria-live="polite"/);
    assert.match(html, new RegExp(`health-widget--${state}`));
    assert.match(html, /KEYFORTA capability status/);
  });
}
