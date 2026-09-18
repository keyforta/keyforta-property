import assert from 'node:assert/strict';
import test from 'node:test';

import { keyfortaBrand } from '../src/index.js';

test('brand exports the canonical palette and fonts', () => {
  assert.equal(keyfortaBrand.name, 'KEYFORTA');
  assert.deepEqual(keyfortaBrand.colors, { aubergine: '#24162E', mineralTeal: '#267C78', burnishedCopper: '#C47A4A', softBone: '#F3EEE7' });
  assert.deepEqual(keyfortaBrand.fonts, { display: 'Instrument Sans', body: 'Source Sans 3' });
  assert.ok(Object.isFrozen(keyfortaBrand));
  assert.ok(Object.isFrozen(keyfortaBrand.colors));
  assert.ok(Object.isFrozen(keyfortaBrand.fonts));
});

test('assetPath prefixes asset names with the public root', () => {
  assert.equal(keyfortaBrand.assetPath('logo.svg'), '/logo.svg');
  assert.equal(keyfortaBrand.assetPath('images/home.jpg'), '/images/home.jpg');
});
