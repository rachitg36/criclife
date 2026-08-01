import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // ── The engine must stay pure. See docs/09-ARCHITECTURE.md § 1. ──
    // No React, no network, no DOM, no ambient time.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*'], message: 'The engine must not import React.' },
            {
              group: ['@supabase/*', '@tanstack/*', 'dexie*', 'zustand', 'motion'],
              message: 'The engine must be pure — no I/O or state libraries.',
            },
            { group: ['@/lib/*', '@/stores/*', '@/features/*', '@/components/*'] },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The engine must not touch the DOM.' },
        { name: 'document', message: 'The engine must not touch the DOM.' },
        { name: 'localStorage', message: 'The engine must be pure.' },
        { name: 'fetch', message: 'The engine must not perform I/O.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Pass time in as a parameter — the engine must be deterministic.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'The engine must be deterministic.',
        },
      ],
    },
  }
);
