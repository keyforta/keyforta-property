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