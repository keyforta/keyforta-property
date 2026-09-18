import assert from 'node:assert/strict';
import test from 'node:test';

import { authSurfaces, protectedAppRules, sessionKeys } from '../src/index.js';

test('auth surfaces declare login requirements per app boundary', () => {
  assert.equal(authSurfaces.public.loginRequired, false);
  assert.deepEqual(authSurfaces.portal, { loginRequired: true, provider: 'Microsoft Entra External ID' });
  assert.deepEqual(authSurfaces.admin, { loginRequired: true, provider: 'Microsoft Entra External ID' });
  assert.ok(Object.isFrozen(authSurfaces));
});

test('session keys map protected surfaces to stable storage keys', () => {
  assert.deepEqual(sessionKeys, { portal: 'keyforta.portal.session', admin: 'keyforta.admin.session' });
  assert.ok(Object.isFrozen(sessionKeys));
});

test('protected app rules preserve explicit security expectations', () => {
  assert.equal(protectedAppRules.length, 4);
  assert.match(protectedAppRules[3], /platform-admin authorization/);
  assert.ok(Object.isFrozen(protectedAppRules));
});
