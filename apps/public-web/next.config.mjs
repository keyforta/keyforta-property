import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  redirects: async () => [
    {
      destination: 'https://keyforta.com/:path*',
      has: [{ type: 'host', value: 'www.keyforta.com' }],
      permanent: true,
      source: '/:path*',
    },
  ],
  transpilePackages: ['@keyforta/brand'],
};