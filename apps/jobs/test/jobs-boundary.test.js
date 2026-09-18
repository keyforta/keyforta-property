import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('check boundary explains the scaffold state', async () => {
  const { stdout } = await execFileAsync('node', ['scripts/check.mjs'], { cwd: new URL('..', import.meta.url) });
  assert.match(stdout, /worker scaffold is ready for implementation/);
});

test('build boundary explains the runtime is not configured yet', async () => {
  const { stdout } = await execFileAsync('node', ['scripts/build.mjs'], { cwd: new URL('..', import.meta.url) });
  assert.match(stdout, /worker runtime is not configured/);
});
