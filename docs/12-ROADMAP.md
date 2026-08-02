# 12 — Build Roadmap

Nine phases. Each phase ends with something demonstrable. Do not start a phase
before the previous one's acceptance criteria pass.

The ordering is deliberate: **the rules engine is built before any UI**, because
everything else is a view over it, and a wrong engine poisons every screen.

---

## Phase 0 — Foundations
*Goal: an empty but correct skeleton, on free infrastructure.*

**Do these first — they reserve names and cost nothing:**

- [x] Deploy to Cloudflare Workers (Static Assets) named **`criclife`** → live at `criclife.geminirachit.workers.dev`
- [x] Open the is-a.dev PR for **`criclife.is-a.dev`** — [is-a-dev/register#45746](https://github.com/is-a-dev/register/pull/45746), pending merge
- [x] Supabase projects `criclife-prod` + `criclife-staging` (your 2 free projects)
- [x] Resend account → wire as Supabase custom SMTP (both projects); **phone auth disabled**
- [x] `.github/workflows/keepalive.yml` — prevents the 7-day Supabase pause; run once, succeeded
- [x] Make the GitHub repo **public** (unlimited free Actions minutes)
- [ ] Cloudflare Web Analytics enabled; Sentry Developer project created — *deferred, wiring lands in Phase 9*

*Full detail and the reasoning in [14-FREE-TIER-PLAN](./14-FREE-TIER-PLAN.md) § 7.*

**Then the code skeleton:**

- [x] Vite + React 19 + TypeScript (strict) project
- [x] Tailwind v4 with the token file from [08](./08-DESIGN-SYSTEM.md)
- [x] Theme provider: dark / light / auto, no-flash inline script, View
      Transition toggle
- [x] UI primitives themed to the token set: Button, Card, Skeleton, CountUp,
      Aurora, LivePill, ThemeToggle
- [x] React Router with the full route tree, all screens stubbed
- [ ] Local dev via `supabase start` (keeps you at 2 free cloud projects) —
      *deferred to Phase 2. The `supabase` CLI is already a devDependency, but
      `supabase/` holds no migrations until Phase 2, so there is nothing for a
      local stack to serve. Running it now would only burn Docker disk.*
- [x] ESLint, Prettier, Vitest, Playwright — Husky pre-commit runs `lint-staged`
- [x] CI: typecheck, lint, test, `size-limit` — *Lighthouse CI not set up*
- [x] PWA manifest + service worker
- [x] Self-hosted Inter + Geist in `public/fonts/` — variable, latin subset,
      committed with their OFL licences

**Done when:** the app installs on a phone from `criclife.geminirachit.workers.dev`, shows an
empty themed shell, the dark/light toggle animates correctly, and the keepalive
workflow has run at least once.

> **Status 2026-08-02:** Deployed, themed shell renders, toggle verified, and
> the keepalive workflow has run successfully. **Not yet verified: installing
> to a real phone's home screen.** The manifest, icons and service worker are
> all in place and the SW registers on the deployed URL, but nobody has done
> the Add-to-Home-Screen flow on an actual device.

---

## Phase 1 — The rules engine
*Goal: cricket, correctly, with no UI at all.*

- [ ] `src/engine/types.ts` — MatchState, InningsState, DeliveryInput
- [ ] `config.ts` — defaults + the 6 built-in rules profiles
- [ ] `applyDelivery.ts` — the 13-step algorithm from [04](./04-RULES-ENGINE.md) §4
- [ ] `strike.ts`, `dismissals.ts`, `inningsEnd.ts`, `result.ts`
- [ ] `replay.ts` — fold a `Delivery[]` into `MatchState`
- [ ] `scorecard.ts`, `projections.ts`, `commentary.ts`
- [ ] Unit tests for every row of the §5.2 legality table
- [ ] Property tests (fast-check) for the invariants in §12
- [ ] **Three full real-match fixtures replayed to a byte-identical scorecard**

**Done when:** 100% branch coverage on `src/engine`, all three fixtures pass,
and `applyDelivery` runs in under 1ms.

> This phase has no visible output. Resist the urge to skip it. Every hour here
> saves five later.

---

## Phase 2 — Data layer & auth
*Goal: real users, real teams, real players, correct permissions.*

- [ ] All migrations from [02](./02-DATA-MODEL.md): tables, enums, indexes, triggers
- [ ] `is_super_admin()`, `is_team_manager()`, `can_manage_match()`, `can_score()`
- [ ] RLS policies on every table, deny-by-default
- [ ] pgTAP suite: every policy tested as anon / player / team admin / grant
      holder / super admin
- [ ] Seed script: 4 teams, 44 players, 1 super admin
- [ ] Supabase Auth: magic link (Resend custom SMTP) + Google. Phone OTP disabled.
- [ ] `/login`, `/auth/callback`, `/onboarding`
- [ ] TanStack Query setup, typed Supabase client (generated types)

**Done when:** the pgTAP suite is green and a non-admin cannot write a delivery
by any route.

---

## Phase 3 — Teams, players & self-managed roles
*Goal: the first genuinely useful feature.*

- [ ] `/teams`, `/teams/new`, `/teams/:teamId`, `/teams/:teamId/squad`
- [ ] Add player: invite existing user **and** create shadow player + claim code
- [ ] `/players/:playerId` profile
- [ ] **`/players/:playerId/edit` — self-service role management** (primary/secondary
      role, batting hand, bowling style)
- [ ] Role suggestion flow: admin suggests → player accepts/rejects
- [ ] `role_locked_by_admin` respected in the UI
- [ ] Team settings: colours, logo, member roles, ownership transfer

**Done when:** E2E flows 2 and 3 pass — a player can change their own role, and
a team admin provably cannot.

---

## Phase 4 — Match setup & the scoring token
*Goal: the permission model, visible and working.*

- [ ] `/matches/new` — the 4-step wizard, **overs per innings configurable**
- [ ] Rules profile picker + custom config
- [ ] `/matches/:matchId/setup` — toss, XI selection, batting order, captain, keeper
- [ ] `scoring_grants` RPCs: issue, revoke, transfer, handoff token
- [ ] **`/matches/:matchId/rights` — the Scoring Rights Map**, animated graph +
      accessible list view
- [ ] QR handoff (generate + scan)
- [ ] Realtime grant propagation: revoke locks an open pad within 2s
- [ ] Notifications on grant issued / revoked

**Done when:** E2E flow 4 passes — Scorer A passes the token to Scorer B, A's
pad locks and B's unlocks, both seeing the map update live.

---

## Phase 5 — The scorer view
*Goal: score a full match on a phone without scrolling.*

- [ ] `ScoringLayout` — 100dvh, `overflow: hidden`, safe areas
- [ ] Score block, batters row, bowler row, over-dot strip
- [ ] Run pad 0–6 + `7+`, modifier row, action row
- [ ] Wicket sheet with the free-hit legality gating
- [ ] Batter picker, bowler picker (limits + consecutive-over exclusion)
- [ ] Undo, edit-a-previous-ball, ball history
- [ ] `record_delivery` RPC + optimistic store updates
- [ ] Haptics, wake lock, handedness mirroring, accidental-tap guard
- [ ] Innings break and match-complete flows, super over
- [ ] Scorer sub-tabs: Scorecard, Map, Feed, Settings

**Done when:** the scroll assertion passes at all four viewports, E2E flow 1
passes, and a real 20-over match can be scored end to end on a phone.

---

## Phase 6 — Offline & concurrency
*Goal: it works at a ground with no signal and two scorers.*

- [ ] Dexie schema + write-first-locally delivery path
- [ ] Sync worker with backoff, batching, idempotency
- [ ] Sync pill UI: synced / pending / offline / error
- [ ] `STALE_SEQ` conflict handling + the merge screen
- [ ] Soft locks broadcast between co-scorers
- [ ] Review Tray for balls rejected because a grant was revoked while offline
- [ ] Service worker update blocked while scoring or while the queue is non-empty
- [ ] Workbox caching strategies

**Done when:** E2E flows 5, 6 and 7 pass — including 12 balls scored fully
offline syncing exactly once.

---

## Phase 7 — Audience view
*Goal: the shareable, beautiful, live experience.*

- [ ] `/live/:publicSlug`, public and unauthenticated
- [ ] Hero with count-up score, aurora, team tinting
- [ ] Realtime subscription, <1.5s p95 latency
- [ ] Ball-by-ball feed with spring entry and over dividers
- [ ] Scorecard tab
- [ ] Charts tab: worm, manhattan, run-rate, partnerships, wagon wheel
- [ ] Win probability bar
- [ ] Moments: four, six, wicket, fifty, hundred, maiden, hat-trick ball,
      last over, match won
- [ ] Calm mode + `prefers-reduced-motion` respected everywhere
- [ ] Big-screen `?tv=1` mode
- [ ] OG share image edge function
- [ ] Completed-match **replay scrubber**

**Done when:** a spectator on 4G sees a six celebrate within 1.5s of the tap,
and Lighthouse mobile perf on `/live/:publicSlug` is ≥ 90.

---

## Phase 8 — Stats & ranks
*Goal: the reason people come back between matches.*

- [ ] `finalize_match` edge function
- [ ] `player_match_stats` computation incl. `rating_points`
- [ ] `player_career_stats` plain table + rewrite routine
- [ ] `recompute_rankings` edge function + nightly cron
- [ ] `ranking_snapshots` and movement indicators
- [ ] **`/ranks`** — 5 boards, podium, dense rows, sticky "you" pill
- [ ] **Team multi-select filter**, with the unfiltered global board as default
- [ ] Format / period / role / min-matches filters, URL-encoded
- [ ] Emerging section with qualification progress
- [ ] `/stats` league leaderboards
- [ ] Player profile career tables, form strip, milestones
- [ ] `/ranks/compare` head-to-head radar

**Done when:** E2E flow 8 passes — completing a match updates career stats and
the rankings, and filtering by two teams renumbers correctly while preserving
global ranks as ghost numbers.

---

## Phase 9 — Admin, polish & launch
*Goal: operable by a human, pleasant to use.*

- [ ] `/admin/*` — users, players (merge), teams, matches (unlock),
      grants, rules profiles, app settings, data tools, audit log
- [ ] Notifications: web push for grants, milestones, results, rank changes
- [ ] Empty states with custom illustrations
- [ ] Skeleton loaders everywhere
- [ ] Full a11y pass: axe zero serious violations, keyboard scoring, screen
      reader pass on the scorer view and the rights map
- [ ] Visual regression suite: scorer + audience, both themes, 4 viewports
- [ ] Performance budgets enforced in CI
- [ ] Sentry, analytics, error taxonomy
- [ ] Data export, account deletion
- [ ] Onboarding tour for first-time scorers
- [ ] Beta with one real club for a full weekend of matches

**Done when:** a real match is scored by a real club with no developer present
and no data loss.

---

## Post-v1 backlog

| Idea | Notes |
|---|---|
| Tournaments & leagues | Groups, fixtures, points table, NRR |
| DLS | Data model already stores `overs_lost` and interruptions |
| Test / multi-day | Declarations, follow-on, 4 innings |
| Impact player substitutions | |
| Live streaming embed | YouTube/Twitch iframe on the audience view |
| AI match report | Generate a narrative summary from the delivery log |
| Voice scoring | "One run" / "Four" — hands-free at the boundary |
| Umpire mode | Separate device for no-ball / wide signalling |
| Player availability polls | "Who's in for Sunday?" |
| Fantasy league | On top of the existing rating engine |
| Wearable companion | Watch face showing the live score |

---

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Engine bugs corrupt scores | Fatal to trust | Phase 1 first, 100% coverage, three fixture replays, server-side revalidation |
| Two scorers double-count | Disputed results | Server-assigned `seq`, idempotency keys, soft locks, merge screen |
| Offline sync loses balls | Fatal to trust | Write to Dexie *before* optimistic UI; Review Tray; never silently drop |
| Scorer view scrolls on some phone | Breaks the core promise | Automated scroll assertion at 4 viewports gating every PR |
| Heavy animations drain battery / lag | Scorer abandons the app | Inverted effects budget, calm mode, pooled canvas, `content-visibility` |
| Grant revoked mid-over | Confusion | Realtime lock within 2s + a clear, non-blaming message |
| RLS gap exposes data | Security incident | pgTAP suite as 5 personas, deny-by-default, CI check for the service key |
| Ranking formula feels unfair | Users disengage | Publish the formula in-app, show the components per match, confidence bars |
| Rain / interruptions | Wrong results | v1 supports manual revised target; DLS deferred but data captured |
