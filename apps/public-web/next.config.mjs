import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@keyforta/brand'],
};