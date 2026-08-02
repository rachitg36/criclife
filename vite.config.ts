import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Docs: see docs/09-ARCHITECTURE.md § 5 for the caching strategy rationale.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt', // NEVER auto-reload — a scorer may be mid-over.
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'fonts/**/*.woff2'],
      manifest: {
        name: 'CricLife',
        short_name: 'CricLife',
        description: 'Live cricket scoring, stats and rankings.',
        theme_color: '#05070d',
        background_color: '#05070d',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['sports', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: false, // do not steal control from an open scoring session
        skipWaiting: false,
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Fonts and icons — immutable
            urlPattern: ({ request }) =>
              request.destination === 'font' || request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'criclife-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Supabase REST reads. Writes are handled by our own Dexie queue
            // and must NEVER be cached — see docs/09 § 5.
            urlPattern: ({ url, request }) =>
              url.hostname.endsWith('.supabase.co') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'criclife-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep the scoring pad out of the audience bundle and vice versa.
          // @supabase/supabase-js is deliberately NOT grouped here — it's
          // only reachable from the lazy-loaded auth pages (AuthedOutlet),
          // and forcing it into an eager chunk alongside react-query blew
          // the audience route's 180KB budget by 30KB+. Same lesson as
          // dexie before it (see HANDOFF.md): let Rollup's automatic
          // splitting follow the real import graph instead of a static
          // package-to-chunk grouping.
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-motion': ['motion'],
          'vendor-data': ['@tanstack/react-query'],
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
