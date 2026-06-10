/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: [
      'tests/e2e/**',
      'node_modules/**',
      'functions/**',
      '.next/**',
    ],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      // Order matters: vite matches string aliases by prefix in declaration
      // order, so the more specific '@/server' must come before the broad '@'
      // or it gets shadowed (→ src/server/... which doesn't exist).
      '@/server': path.resolve(__dirname, './src/backend/server'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
