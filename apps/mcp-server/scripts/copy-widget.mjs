import { copyFile, mkdir } from 'node:fs/promises';

const targetDirectory = new URL('../dist/widget/', import.meta.url);
await mkdir(targetDirectory, { recursive: true });
await copyFile(
  new URL('../../../tools/system/health/dist/index.html', import.meta.url),
  new URL('index.html', targetDirectory),
);