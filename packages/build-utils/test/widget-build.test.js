import assert from 'node:assert/strict';
import test from 'node:test';

import { widgetBuildConfig } from '../src/index.js';

test('uses deterministic standalone widget build output', () => {
  assert.deepEqual(widgetBuildConfig({ root: '/synthetic/widget' }).build, {
    assetsDir: 'assets',
    emptyOutDir: true,
    outDir: 'dist',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    sourcemap: false,
  });
});
