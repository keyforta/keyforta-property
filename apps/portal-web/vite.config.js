import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxyTarget = process.env.VITE_KEYFORTA_API_PROXY_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  root: 'src',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: false,
      },
    },
  },
  build: { outDir: '../dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    css: true,
    include: ['../test/**/*.test.{js,jsx}'],
  },
});
