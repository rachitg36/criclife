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
import { NotFoundPage } from '@/features/system/NotFoundPage';
import { ErrorPage } from '@/features/system/ErrorPage';

/* ── Code split points. docs/09-ARCHITECTURE.md § 6 ───────────
   The audience bundle must not contain the scoring pad, and the
   scorer bundle must not contain the charts. Auth pages are split
   the same way — the audience route must not pull in supabase-js
   via AuthProvider (see AuthedOutlet, providers/index.tsx).        */
// Home used to be a static import — it was a placeholder with no data. Now it
// reads `useMatches`, and a static import of anything that touches
// `lib/supabase` lands supabase-js in the eager chunk that `/live/:publicSlug`
// also downloads. That is CLAUDE.md rule 9's 180 kB budget, and it has been
// blown this way three times. Lazy, like every other page.
const HomePage = lazy(() =>
  import('@/features/home/HomePage').then((m) => ({ default: m.HomePage }))
);
const ScorerRoute = lazy(() => import('@/features/scoring/ScorerRoute'));
const AudienceRoute = lazy(() => import('@/features/audience/AudienceRoute'));
const RanksRoute = lazy(() => import('@/features/ranks/RanksRoute'));
const CompareRoute = lazy(() => import('@/features/ranks/CompareRoute'));
const StatsRoute = lazy(() => import('@/features/stats/StatsRoute'));
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
const TeamsPage = lazy(() =>
  import('@/features/teams/TeamsPage').then((m) => ({ default: m.TeamsPage }))
);
const NewTeamPage = lazy(() =>
  import('@/features/teams/NewTeamPage').then((m) => ({ default: m.NewTeamPage }))
);
const TeamSquadPage = lazy(() =>
  import('@/features/teams/TeamSquadPage').then((m) => ({ default: m.TeamSquadPage }))
);
const TeamMatchesPage = lazy(() =>
  import('@/features/teams/TeamMatchesPage').then((m) => ({ default: m.TeamMatchesPage }))
);
const TeamStatsPage = lazy(() =>
  import('@/features/teams/TeamStatsPage').then((m) => ({ default: m.TeamStatsPage }))
);
const AddPlayerPage = lazy(() =>
  import('@/features/teams/AddPlayerPage').then((m) => ({ default: m.AddPlayerPage }))
);
const TeamSettingsPage = lazy(() =>
  import('@/features/teams/TeamSettingsPage').then((m) => ({ default: m.TeamSettingsPage }))
);
const PlayerProfilePage = lazy(() =>
  import('@/features/players/PlayerProfilePage').then((m) => ({ default: m.PlayerProfilePage }))
);
const PlayerEditPage = lazy(() =>
  import('@/features/players/PlayerEditPage').then((m) => ({ default: m.PlayerEditPage }))
);
const ClaimPlayerPage = lazy(() =>
  import('@/features/players/ClaimPlayerPage').then((m) => ({ default: m.ClaimPlayerPage }))
);
const MatchesPage = lazy(() =>
  import('@/features/matches/MatchesPage').then((m) => ({ default: m.MatchesPage }))
);
const MatchSettingsPage = lazy(() =>
  import('@/features/matches/MatchSettingsPage').then((m) => ({ default: m.MatchSettingsPage }))
);
const NewMatchPage = lazy(() =>
  import('@/features/matches/NewMatchPage').then((m) => ({ default: m.NewMatchPage }))
);
const MatchHubPage = lazy(() =>
  import('@/features/matches/MatchHubPage').then((m) => ({ default: m.MatchHubPage }))
);
const MatchSetupPage = lazy(() =>
  import('@/features/matches/MatchSetupPage').then((m) => ({ default: m.MatchSetupPage }))
);
const ScoringRightsMapPage = lazy(() =>
  import('@/features/matches/ScoringRightsMapPage').then((m) => ({
    default: m.ScoringRightsMapPage,
  }))
);
const RedeemGrantPage = lazy(() =>
  import('@/features/matches/RedeemGrantPage').then((m) => ({ default: m.RedeemGrantPage }))
);
const ReviewTrayPage = lazy(() =>
  import('@/features/matches/ReviewTrayPage').then((m) => ({ default: m.ReviewTrayPage }))
);

const stub = (title: string, phase: number, doc?: string, description?: string) => ({
  element: <Placeholder title={title} phase={phase} doc={doc} description={description} />,
});

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      /* ── Audience — PUBLIC, no auth, no auth code at all (Phase 7) ─ */
      {
        element: <PublicLayout />,
        children: [
          { path: '/live/:publicSlug', element: <AudienceRoute /> },
          { path: '/ranks', element: <RanksRoute /> },
          { path: '/ranks/compare', element: <CompareRoute /> },
          { path: '/stats', element: <StatsRoute /> },
          { path: '/matches/:matchId/scorecard', ...stub('Scorecard', 5) },
          { path: '/matches/:matchId/feed', ...stub('Ball-by-ball', 5) },
        ],
      },

      /* ── Public-READ, auth-AWARE (Phase 3) ───────────────
             Team/player pages are reachable with no session, but a manager
             or the player themself sees extra controls once one exists — so
             AuthProvider rides along here (lazy), unlike the strict audience
             branch above which must stay supabase-js-free. ── */
      {
        lazy: async () => {
          const m = await import('./layouts/PublicAuthedOutlet');
          return { Component: m.PublicAuthedOutlet };
        },
        children: [
          { path: '/teams/:teamId', element: <TeamSquadPage /> },
          { path: '/teams/:teamId/squad', element: <TeamSquadPage /> },
          { path: '/teams/:teamId/matches', element: <TeamMatchesPage /> },
          { path: '/teams/:teamId/stats', element: <TeamStatsPage /> },
          { path: '/players/:playerId', element: <PlayerProfilePage /> },
          { path: '/matches/:matchId', element: <MatchHubPage /> },
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

          /* ── Scorer view — its own no-scroll shell, no AppLayout chrome
                 (Phase 5). Deliberately NOT wrapped in <RequireAuth> the way
                 the rest of this branch is: RequireAuth's redirect renders a
                 <Navigate>, which swaps the entire matched route — including
                 this ScoringLayout — for /login's, so the no-scroll shell
                 unmounts outright instead of showing a state inside it.
                 RequireScoringGrant folds "not signed in" into its own
                 checking/denied states (rendered *inside* ScoringLayout) so
                 the shell stays mounted and the zero-scroll guarantee holds
                 no matter how the auth/grant check comes out. ── */
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
              { path: '/teams', element: <TeamsPage /> },
              { path: '/teams/new', element: <NewTeamPage /> },
              { path: '/teams/:teamId/add-player', element: <AddPlayerPage /> },
              { path: '/teams/:teamId/settings', element: <TeamSettingsPage /> },

              /* Players (Phase 3) */
              { path: '/players/:playerId/edit', element: <PlayerEditPage /> },
              { path: '/players/claim', element: <ClaimPlayerPage /> },

              /* Matches (Phases 4–6) */
              { path: '/matches', element: <MatchesPage /> },
              { path: '/matches/new', element: <NewMatchPage /> },
              { path: '/matches/:matchId/setup', element: <MatchSetupPage /> },
              { path: '/matches/:matchId/rights', element: <ScoringRightsMapPage /> },
              { path: '/redeem-grant/:token', element: <RedeemGrantPage /> },
              { path: '/matches/:matchId/settings', element: <MatchSettingsPage /> },
              { path: '/matches/:matchId/review', element: <ReviewTrayPage /> },

              /* Settings (Phase 9, appearance ships in Phase 0) */
              {
                path: '/settings',
                lazy: async () => {
                  const m = await import('@/features/settings/SettingsIndex');
                  return { Component: m.SettingsIndex };
                },
              },
              {
                path: '/settings/profile',
                lazy: async () => {
                  const m = await import('@/features/settings/ProfileSettings');
                  return { Component: m.ProfileSettings };
                },
              },
              {
                path: '/settings/appearance',
                lazy: async () => {
                  const m = await import('@/features/settings/AppearanceSettings');
                  return { Component: m.AppearanceSettings };
                },
              },
              {
                path: '/settings/scoring',
                lazy: async () => {
                  const m = await import('@/features/settings/ScoringSettings');
                  return { Component: m.ScoringSettings };
                },
              },
              { path: '/settings/notifications', ...stub('Notifications', 9) },
              {
                path: '/settings/data',
                lazy: async () => {
                  const m = await import('@/features/settings/DataSettings');
                  return { Component: m.DataSettings };
                },
              },
              {
                path: '/settings/about',
                lazy: async () => {
                  const m = await import('@/features/settings/AboutSettings');
                  return { Component: m.AboutSettings };
                },
              },
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
