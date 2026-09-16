import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('build contains its widget deployment resource', async () => {
  const html = await readFile(new URL('../dist/widget/index.html', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');

  assert.match(html, /<!doctype html>/i);
  assert.match(appSource, /\.\/widget\/index\.html/);
});