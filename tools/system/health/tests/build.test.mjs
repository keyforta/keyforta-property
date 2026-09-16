import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('build emits a self-contained widget document', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /<script\b[^>]*\btype="module"[^>]*>/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=["'][^"']+/);
  assert.match(html, /<div id="root"><\/div>/);
});