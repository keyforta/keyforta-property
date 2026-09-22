import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createBrowserEntraAuth } from '../src/index.js';

test('browser auth fails closed without public Entra configuration', () => {
  assert.equal(createBrowserEntraAuth({}).getSnapshot().status, 'unavailable');
});

test('browser auth keeps tokens in MSAL memory cache', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /cacheLocation: BrowserCacheLocation\.MemoryStorage/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|clientSecret/);
  assert.match(source, /acquireTokenSilent/);
  assert.match(source, /loginPopup|acquireTokenPopup|logoutPopup/);
  assert.doesNotMatch(source, /loginRedirect|acquireTokenRedirect|logoutRedirect/);
  assert.match(source, /knownAuthorities: \[config\.knownAuthority\]/);
  assert.match(source, /broadcastResponseToMainFrame\(\)/);
});

test('browser auth exposes a silent-only, non-throwing token method that never opens a popup', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /async getAccessTokenSilent\(\)/);
  // The silent-only method must not call any interactive popup API; only
  // getAccessToken()'s InteractionRequiredAuthError fallback may do so.
  const [, silentBody] = source.split('async getAccessTokenSilent()');
  const methodBody = silentBody.split(/\n {4}\},/)[0];
  assert.doesNotMatch(methodBody, /Popup|Redirect/);

  // Without configuration (no client ever constructed), it resolves to null
  // rather than throwing, unlike getAccessToken().
  const auth = createBrowserEntraAuth({});
  await assert.doesNotReject(() => auth.getAccessTokenSilent());
  assert.equal(await auth.getAccessTokenSilent(), null);
});

test('browser auth re-establishes a still-valid session on reload via ssoSilent, not client-side persistence', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  // MemoryStorage empties the account cache on every page reload; ssoSilent()
  // re-authenticates from the browser's existing Entra session cookie
  // instead, so a refresh does not force a re-login while that session
  // remains valid, without weakening the no-client-storage invariant above.
  assert.match(source, /client\.ssoSilent\(\{ scopes: \[config\.apiScope\] \}\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});