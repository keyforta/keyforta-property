import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export function createWidgetConfig(root: string): UserConfig {
  return defineConfig({
    root,
    plugins: [react(), viteSingleFile()],
    build: {
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      emptyOutDir: true,
      target: 'es2022',
    },
  });
}