import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'apps/api/src/**/*.test.ts',
      'apps/kiosk/src/**/*.test.ts',
      'packages/**/*.test.ts',
    ],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './apps/api/src'),
    },
  },
});
