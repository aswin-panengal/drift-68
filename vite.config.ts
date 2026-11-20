import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist/webview', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 700,
    rollupOptions: { output: { entryFileNames: 'game.js', chunkFileNames: '[name].js', assetFileNames: '[name][extname]' } } },
});
