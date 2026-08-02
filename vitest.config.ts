import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * V8 coverage instrumentation slows the code under test by roughly an order of
 * magnitude, which makes wall-clock assertions meaningless. The engine's
 * "under 1ms" budget is therefore only enforced on an uninstrumented run —
 * see tests/engine/performance.test.ts.
 */
const coverageEnabled = process.argv.includes('--coverage');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    env: { VITEST_COVERAGE: coverageEnabled ? '1' : '0' },
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/index.ts',
        'src/main.tsx',
        // Type-only module: erased at compile time, so there is no runtime
        // code to cover and v8 reports a misleading 0%.
        'src/engine/types.ts',
      ],
      // The rules engine is held to 100% branch coverage.
      // docs/09-ARCHITECTURE.md § 9, docs/12-ROADMAP.md Phase 1.
      thresholds: {
        'src/engine/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
});
