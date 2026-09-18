import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    css: true,
    include: ['test/**/*.test.{js,jsx}'],
  },
  resolve: {
    conditions: ['browser', 'module', 'import', 'default'],
  },
});
