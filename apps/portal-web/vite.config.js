import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_KEYFORTA_API_PROXY_TARGET || 'http://127.0.0.1:3000';

  return {
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
  };
});
