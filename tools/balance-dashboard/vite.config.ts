import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
