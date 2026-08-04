import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Docs: see docs/09-ARCHITECTURE.md § 5 for the caching strategy rationale.
/**
 * The build's own identity, baked in at build time.
 *
 * Half of this project's field reports have turned out to be a phone running a
 * cached older build — the service worker never auto-reloads on purpose
 * (CLAUDE.md rule 6), so a stale tab looks exactly like a bug that was fixed
 * days ago. There was no way to tell from the screen. Now there is, on both
 * the scorer and the audience view.
 *
 * The date, not a git SHA: the person reading it off a phone at a ground needs
 * to answer "is this today's build", not identify a commit.
 */
const BUILD_ID = `${pkg.version}+${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(BUILD_ID) },
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
            // Fonts and app icons — effectively immutable, so a long TTL is
            // safe. docs/09 § 5: "Fonts, icons — CacheFirst, 1 year."
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'criclife-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Team crests, player photos — user-supplied, so a shorter TTL
            // and an entry cap. docs/09 § 5: "CacheFirst, 30 days, max 200."
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'criclife-images',
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
          // Named on purpose. `qrcode` used to live inside
          // ScoringRightsMapPage; the moment a second page (ShareMatch on the
          // match hub) imported it, Rollup hoisted it to a shared chunk called
          // `browser-*.js` — 25 kB of unidentifiable weight that the audience
          // budget then charged for, because the exclusion list can only skip
          // names it recognises. It is still lazy: nothing eager imports it.
          'vendor-qrcode': ['qrcode'],
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
