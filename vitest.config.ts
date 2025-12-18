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
      '@': path.resolve(__dirname, './src'),
    },
  },
});
