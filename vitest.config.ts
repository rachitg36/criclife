import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/index.ts', 'src/main.tsx'],
      // ── Enable in Phase 1, once src/engine/ exists. ──
      // The rules engine is held to 100% branch coverage; a per-glob threshold
      // errors today because no files match the pattern.
      // docs/09-ARCHITECTURE.md § 9
      // thresholds: {
      //   'src/engine/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
      // },
    },
  },
});
