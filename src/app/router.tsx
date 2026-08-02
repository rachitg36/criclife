import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';

import { RootLayout } from './layouts/RootLayout';
import { AppLayout } from './layouts/AppLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { ScoringLayout } from './layouts/ScoringLayout';
import { RequireAuth } from './guards/RequireAuth';
import { RequireSuperAdmin } from './guards/RequireSuperAdmin';
import { RequireScoringGrant } from './guards/RequireScoringGrant';
import { Placeholder } from '@/components/ui/Placeholder';
import { HomePage } from '@/features/home/HomePage';
import { NotFoundPage } from '@/features/system/NotFoundPage';
import { ErrorPage } from '@/features/system/ErrorPage';

/* ── Code split points. docs/09-ARCHITECTURE.md § 6 ───────────
   The audience bundle must not contain the scoring pad, and the
   scorer bundle must not contain the charts. Auth pages are split
   the same way — the audience route must not pull in supabase-js
   via AuthProvider (see AuthedOutlet, providers/index.tsx).        */
const ScorerRoute = lazy(() => import('@/features/scoring/ScorerRoute'));
const AudienceRoute = lazy(() => import('@/features/audience/AudienceRoute'));
const RanksRoute = lazy(() => import('@/features/ranks/RanksRoute'));
const AdminRoute = lazy(() => import('@/features/admin/AdminRoute'));
const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const AuthCallbackPage = lazy(() =>
  import('@/features/auth/AuthCallbackPage').then((m) => ({ default: m.AuthCallbackPage }))
);
const OnboardingPage = lazy(() =>
  import('@/features/auth/OnboardingPage').then((m) => ({ default: m.OnboardingPage }))
);

const stub = (title: string, phase: number, doc?: string, description?: string) => ({
  element: <Placeholder title={title} phase={phase} doc={doc} description={description} />,
});

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      /* ── Audience — PUBLIC, no auth (Phase 7) ──────────── */
      {
        element: <PublicLayout />,
        children: [
          { path: '/live/:publicSlug', element: <AudienceRoute /> },
          { path: '/ranks', element: <RanksRoute /> },
          {
            path: '/ranks/compare',
            ...stub('Compare players', 8, '07-STATS-AND-RANKINGS.md', 'Head-to-head radar.'),
          },
          {
            path: '/stats',
            ...stub('League stats', 8, '07-STATS-AND-RANKINGS.md', 'Leaderboards.'),
          },
          {
            path: '/players/:playerId',
            ...stub('Player profile', 3, '11-SCREENS-AND-ROUTES.md'),
          },
          { path: '/teams/:teamId', ...stub('Team', 3, '11-SCREENS-AND-ROUTES.md') },
          { path: '/teams/:teamId/squad', ...stub('Squad', 3) },
          { path: '/teams/:teamId/matches', ...stub('Team matches', 3) },
          { path: '/teams/:teamId/stats', ...stub('Team stats', 8) },
          { path: '/matches/:matchId/scorecard', ...stub('Scorecard', 5) },
          { path: '/matches/:matchId/feed', ...stub('Ball-by-ball', 5) },
        ],
      },

      /* ── Scorer view — its own no-scroll shell (Phase 5) ─ */
      {
        element: <ScoringLayout />,
        children: [
          {
            path: '/matches/:matchId/score',
            element: (
              <RequireScoringGrant>
                <ScorerRoute />
              </RequireScoringGrant>
            ),
          },
        ],
      },

      /* ── Everything that needs a session — AuthProvider is scoped
             here, not globally, so the audience bundle stays auth-free. ── */
      {
        lazy: async () => {
          const m = await import('./layouts/AuthedOutlet');
          return { Component: m.AuthedOutlet };
        },
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/auth/callback', element: <AuthCallbackPage /> },
          {
            path: '/onboarding',
            element: (
              <RequireAuth>
                <OnboardingPage />
              </RequireAuth>
            ),
          },

          /* ── Authenticated app shell ───────────────────── */
          {
            element: (
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            ),
            children: [
              { index: true, element: <HomePage /> },

              /* Teams (Phase 3) */
              { path: '/teams', ...stub('Teams', 3, '11-SCREENS-AND-ROUTES.md') },
              { path: '/teams/new', ...stub('Create a team', 3) },
              { path: '/teams/:teamId/add-player', ...stub('Add a player', 3) },
              { path: '/teams/:teamId/settings', ...stub('Team settings', 3) },

              /* Players (Phase 3) */
              {
                path: '/players/:playerId/edit',
                ...stub(
                  'Edit your player profile',
                  3,
                  '03-ROLES-PERMISSIONS.md',
                  'Set your own playing role, batting hand and bowling style.'
                ),
              },
              { path: '/players/claim', ...stub('Claim your player record', 3) },

              /* Matches (Phases 4–6) */
              { path: '/matches', ...stub('Matches', 4) },
              {
                path: '/matches/new',
                ...stub(
                  'New match',
                  4,
                  '11-SCREENS-AND-ROUTES.md',
                  'Overs per innings is set here.'
                ),
              },
              { path: '/matches/:matchId', ...stub('Match hub', 4) },
              { path: '/matches/:matchId/setup', ...stub('Toss & playing XI', 4) },
              {
                path: '/matches/:matchId/rights',
                ...stub(
                  'Scoring Rights Map',
                  4,
                  '03-ROLES-PERMISSIONS.md',
                  'Who can score right now — issue, pass, revoke.'
                ),
              },
              { path: '/matches/:matchId/settings', ...stub('Match settings', 4) },
              {
                path: '/matches/:matchId/review',
                ...stub(
                  'Review tray',
                  6,
                  '05-SCORER-VIEW.md',
                  'Offline balls the server rejected.'
                ),
              },

              /* Settings (Phase 9, appearance ships in Phase 0) */
              { path: '/settings', ...stub('Settings', 9) },
              { path: '/settings/profile', ...stub('Your profile', 3) },
              {
                path: '/settings/appearance',
                lazy: async () => {
                  const m = await import('@/features/settings/AppearanceSettings');
                  return { Component: m.AppearanceSettings };
                },
              },
              { path: '/settings/scoring', ...stub('Scoring preferences', 5) },
              { path: '/settings/notifications', ...stub('Notifications', 9) },
              { path: '/settings/data', ...stub('Data & storage', 9) },
              { path: '/settings/about', ...stub('About CricLife', 9) },
            ],
          },

          /* ── Admin (Phase 9) ───────────────────────────── */
          {
            element: (
              <RequireSuperAdmin>
                <AppLayout />
              </RequireSuperAdmin>
            ),
            children: [{ path: '/admin/*', element: <AdminRoute /> }],
          },
        ],
      },

      /* ── System ────────────────────────────────────────── */
      {
        path: '/offline',
        lazy: async () => {
          const m = await import('@/features/system/OfflinePage');
          return { Component: m.OfflinePage };
        },
      },
      { path: '/404', element: <NotFoundPage /> },
      { path: '*', element: <Navigate to="/404" replace /> },
    ],
  },
]);
