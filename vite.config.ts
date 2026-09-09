import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  publicDir: 'public',
  server: {
    fs: { allow: ['..'] },
  },
});
