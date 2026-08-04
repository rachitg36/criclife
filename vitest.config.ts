import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  // `vite.config.ts`'s `define` does not reach here — vitest has its own
  // config — so the build id has to be declared again. A fixed string, since
  // no test should ever depend on when it ran.
  define: { __APP_BUILD__: JSON.stringify('test') },
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // A non-UTC timezone on purpose. The sandbox and CI both run in UTC, which
    // makes every "does this use local time or UTC?" assertion tautological —
    // `toDateTimeLocal` is exactly that question, and prefilling the wrong
    // hour is invisible to anyone testing at Greenwich. +05:30 is where this
    // is being built and has a half-hour offset, so it also catches code that
    // assumes whole-hour zones.
    env: { TZ: 'Asia/Kolkata' },
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/index.ts', 'src/main.tsx'],
      // docs/09-ARCHITECTURE.md § 9 — the rules engine is held to 100% branch coverage.
      thresholds: {
        'src/engine/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
});
