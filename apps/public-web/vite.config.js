import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(appRoot, '../..');

export default defineConfig({
  root: resolve(appRoot, 'src'),
  publicDir: resolve(appRoot, 'public'),
  plugins: [
    react(),
    {
      name: 'copy-hosting-config',
      async closeBundle() {
        const hostingDirectory = resolve(repoRoot, 'dist/.openai');
        await mkdir(hostingDirectory, { recursive: true });
        await cp(resolve(repoRoot, '.openai/hosting.json'), resolve(hostingDirectory, 'hosting.json'));
      },
    },
  ],
  build: {
    outDir: resolve(repoRoot, 'dist'),
    emptyOutDir: true,
  },
});