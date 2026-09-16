export function widgetBuildConfig({ root }) {
  return {
    build: {
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
    },
    root,
  };
}
