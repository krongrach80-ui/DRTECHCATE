import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  root: __dirname,
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/apps/admin'),
    emptyOutDir: true,
  },
});
