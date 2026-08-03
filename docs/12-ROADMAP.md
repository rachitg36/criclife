# 12 — Build Roadmap

Nine phases. Each phase ends with something demonstrable. Do not start a phase
before the previous one's acceptance criteria pass.

The ordering is deliberate: **the rules engine is built before any UI**, because
everything else is a view over it, and a wrong engine poisons every screen.

## Status — 2026-08-03

| Phase                              | State                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| 0 Foundations                      | ✅ done — 3 open items are deferred by design, see the phase |
| 1 Rules engine                     | ✅ done                                                      |
| 2 Data layer & auth                | ✅ done — sign-in now works against a real project           |
| 3 Teams, players & roles           | ✅ done                                                      |
| 4 Match setup & scoring token      | ✅ done                                                      |
| 5 Scorer view                      | ✅ built; **never run a full match on a phone**              |
| 6 Offline & concurrency            | ✅ built; never run on a real network                        |
| 7 Audience view                    | ✅ built; neither half of its "Done when" bar measured       |
| 8 Stats & ranks                    | ✅ built; end-to-end finalisation never run                  |
| 9 Admin, polish & launch           | 🚧 roughly half                                              |

A tick here means the code exists and its tests pass. It does **not** mean the
phase's "Done when" bar has been met — several of those need a phone, a real
network, or a browser this project has never had. Each phase says which.

The distinction earned itself on 2026-08-03: Phases 5 and 6 were ticked and
green, and the first time the pad opened against real hosted Postgres it hit
three faults none of the tests could see. See HANDOFF.md § 6.4.

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
- [ ] Local dev via `supabase start` (keeps you at 2 free cloud projects) — *not
      set up; no migrations exist until Phase 2, so nothing to run locally yet*
- [x] ESLint, Prettier, Vitest, Playwright — *Husky pre-commit not initialised
      (`prepare` script references it but `.husky/` doesn't exist)*
- [x] CI: typecheck, lint, test, `size-limit` — *Lighthouse CI not set up*
- [x] PWA manifest + service worker
- [ ] Self-hosted Inter + Geist in `public/fonts/` — *not committed; app falls
      back to system font*

**Done when:** the app installs on a phone from `criclife.geminirachit.workers.dev`, shows an
empty themed shell, the dark/light toggle animates correctly, and the keepalive
workflow has run at least once.

> **Status 2026-08-03:** Deployed, themed shell renders, toggle verified, the
> keepalive workflow has run successfully, and **the app has now been installed
> to a real phone's home screen** — the last open item on this phase. Phase 0
> is complete.

---

## Phase 1 — The rules engine
*Goal: cricket, correctly, with no UI at all.*

- [x] `src/engine/types.ts` — MatchState, InningsState, DeliveryInput
- [x] `config.ts` — defaults + the 6 built-in rules profiles
- [x] `applyDelivery.ts` — the 13-step algorithm from [04](./04-RULES-ENGINE.md) §4
- [x] `strike.ts`, `dismissals.ts`, `inningsEnd.ts`, `result.ts`
- [x] `replay.ts` — fold a `Delivery[]` into `MatchState`
- [x] `scorecard.ts`, `projections.ts`, `commentary.ts`
- [x] Unit tests for every row of the §5.2 legality table
- [x] Property tests (fast-check) for the invariants in §12
- [x] **Three full real-match fixtures replayed to a byte-identical scorecard**

**Done when:** 100% branch coverage on `src/engine`, all three fixtures pass,
and `applyDelivery` runs in under 1ms.

> This phase has no visible output. Resist the urge to skip it. Every hour here
> saves five later.

---

## Phase 2 — Data layer & auth
*Goal: real users, real teams, real players, correct permissions.*

- [x] All migrations from [02](./02-DATA-MODEL.md): tables, enums, indexes, triggers
- [x] `is_super_admin()`, `is_team_manager()`, `can_manage_match()`, `can_score()`
- [x] RLS policies on every table, deny-by-default
- [x] pgTAP suite: every policy tested as anon / player / team admin / grant
      holder / super admin
- [x] Seed script: 4 teams, 44 players, 1 super admin
- [~] Supabase Auth: magic link + Google. Phone OTP disabled. **Magic link works
      end to end as of 2026-08-03** — but on Supabase's built-in sender, not
      Resend: custom SMTP was returning 500 and is switched off, so mail only
      reaches addresses on the Supabase org. Google is code-complete and never
      exercised; no Google Cloud OAuth client exists.
- [x] `/login`, `/auth/callback`, `/onboarding`
- [~] TanStack Query setup, typed Supabase client — types are the output of an
      introspection script, not `supabase gen types`, which needs Docker. Both
      projects now have the schema, so this can finally be done properly.

**Done when:** the pgTAP suite is green and a non-admin cannot write a delivery
by any route.

> **Status 2026-08-03:** 221 pgTAP assertions green, and RLS has now been
> evaluated against a real JWT for the first time — somebody has signed up,
> which exercised the `auth.users` trigger and the `profiles` insert policy on
> hosted Postgres rather than the local stub.

---

## Phase 3 — Teams, players & self-managed roles
*Goal: the first genuinely useful feature.*

- [x] `/teams`, `/teams/new`, `/teams/:teamId`, `/teams/:teamId/squad`
- [x] Add player: invite existing user **and** create shadow player + claim code
- [x] `/players/:playerId` profile
- [x] **`/players/:playerId/edit` — self-service role management** (primary/secondary
      role, batting hand, bowling style)
- [x] Role suggestion flow: admin suggests → player accepts/rejects
- [x] `role_locked_by_admin` respected in the UI
- [x] Team settings: colours, logo, member roles, ownership transfer

**Done when:** E2E flows 2 and 3 pass — a player can change their own role, and
a team admin provably cannot.

---

## Phase 4 — Match setup & the scoring token
*Goal: the permission model, visible and working.*

- [x] `/matches/new` — the 4-step wizard, **overs per innings configurable**
- [x] Rules profile picker + custom config
- [x] `/matches/:matchId/setup` — toss, squad selection, batting order, captain, keeper
- [x] `scoring_grants` RPCs: issue, revoke, transfer, handoff token
- [x] **`/matches/:matchId/rights` — the Scoring Rights Map**, animated graph +
      accessible list view
- [x] QR handoff (generate + scan)
- [x] Realtime grant propagation: revoke locks an open pad within 2s
- [x] Notifications on grant issued / revoked

**Done when:** E2E flow 4 passes — Scorer A passes the token to Scorer B, A's
pad locks and B's unlocks, both seeing the map update live.

---

## Phase 5 — The scorer view
*Goal: score a full match on a phone without scrolling.*

- [x] `ScoringLayout` — 100dvh, `overflow: hidden`, safe areas
- [x] Score block, batters row, bowler row, over-dot strip
- [x] Run pad 0–6 + `7+`, modifier row, action row
- [x] Wicket sheet with the free-hit legality gating
- [x] Batter picker, bowler picker (limits + consecutive-over exclusion)
- [x] Undo, edit-a-previous-ball, ball history
- [x] `record_delivery` RPC + optimistic store updates — *shipped with two bugs
      that survived until Phase 8 read the rows back. HANDOFF.md § 8.14.*
- [x] Haptics, wake lock, handedness mirroring, accidental-tap guard
- [x] Innings break and match-complete flows, super over
- [x] Scorer sub-tabs: Scorecard, Map, Feed, Settings

**Done when:** the scroll assertion passes at all four viewports, E2E flow 1
passes, and a real 20-over match can be scored end to end on a phone.

> **Status 2026-08-03:** built. The scroll assertion passes at all four
> viewports **in Chromium only** — the pad has never rendered in WebKit, let
> alone on a phone, and `dvh` plus safe-area handling is exactly where WebKit
> differs. The 20-over match has not happened either. First contact with a
> real project found three things this list could not: no pad state for an
> unstarted innings, swallowed query errors, and a shared Realtime topic that
> crashed the route.

---

## Phase 6 — Offline & concurrency
*Goal: it works at a ground with no signal and two scorers.*

- [x] Dexie schema + write-first-locally delivery path
- [x] Sync worker with backoff, batching, idempotency
- [x] Sync pill UI: synced / pending / offline / error
- [x] `STALE_SEQ` conflict handling + the merge screen
- [x] Soft locks broadcast between co-scorers
- [x] Review Tray for balls rejected because a grant was revoked while offline
- [x] Service worker update blocked while scoring or while the queue is non-empty
- [x] Workbox caching strategies

**Done when:** E2E flows 5, 6 and 7 pass — including 12 balls scored fully
offline syncing exactly once.

---

## Phase 7 — Audience view
*Goal: the shareable, beautiful, live experience.*

- [x] `/live/:publicSlug`, public and unauthenticated
- [x] Hero with count-up score, aurora, team tinting
- [x] Realtime subscription, <1.5s p95 latency — *client built and the
      `supabase_realtime` publication now exists (it never did before, so every
      `postgres_changes` subscription since Phase 5 was silently dead). The
      **latency number itself is unmeasured**: it needs a real Supabase project
      and a real network.*
- [x] Ball-by-ball feed with spring entry and over dividers
- [x] Scorecard tab
- [x] Charts tab: worm, manhattan, run-rate, partnerships, wagon wheel —
      *hand-rolled SVG, not Recharts. Deviation from [01](./01-TECH-STACK.md);
      reasoning in `src/features/audience/chartData.ts` and HANDOFF.md § 6.4.*
- [x] Win probability bar
- [x] Moments: four, six, wicket, fifty, hundred, maiden, hat-trick ball,
      last over, match won
- [x] Calm mode + `prefers-reduced-motion` respected everywhere
- [x] Big-screen `?tv=1` mode
- [ ] OG share image edge function — **deferred to Phase 9 by
      [14](./14-FREE-TIER-PLAN.md) § "Deliberate deviations"**, which overrides
      this bullet: v1 ships the static OG card that is already in
      `public/og-default.png`. Per-match cards need server-side rendering,
      which an SPA on static assets cannot do.
- [x] Completed-match **replay scrubber**
- [x] Squads tab — *in [06](./06-AUDIENCE-VIEW.md) § 2 and
      [11](./11-SCREENS-AND-ROUTES.md) § 2 but missing from this list.*

**Done when:** a spectator on 4G sees a six celebrate within 1.5s of the tap,
and Lighthouse mobile perf on `/live/:publicSlug` is ≥ 90.

> **Status 2026-08-03:** built and green — 331 unit/component tests, 169 pgTAP
> assertions, and the audience route's initial JS measured at **174.69 kB
> brotli against the 180 kB budget** (it was 173.83 kB *before* this phase;
> dropping Zod from the eager chunk paid for the entire view). **Neither
> half of the "Done when" bar has actually been measured**: both need a live
> Supabase project and a real 4G device, and this sandbox has neither. See
> HANDOFF.md § 8.

---

## Phase 8 — Stats & ranks
*Goal: the reason people come back between matches.*

- [x] `finalize_match` — **a Postgres function, not an edge function.** It must
      be atomic with the match completing, and it is testable in pgTAP.
      Deviation from this doc and from [14](./14-FREE-TIER-PLAN.md) § 6,
      reasoned in the migration's own header.
- [x] `player_match_stats` computation incl. `rating_points`
- [x] `player_career_stats` plain table + rewrite routine
- [x] `recompute_rankings` — Postgres function, same reasoning. **Nightly cron
      not wired**: it needs `pg_cron` enabled on a real project, which is a
      dashboard action nobody has taken. It runs on every match completion,
      which is the case that matters.
- [x] `ranking_snapshots` and movement indicators
- [x] **`/ranks`** — 5 boards, podium, dense rows, Emerging section
- [x] **Team multi-select filter**, with the unfiltered global board as default
- [x] Role / min-matches filters, URL-encoded — *format and period filters are
      **not** built; both need a per-format or per-window career rollup that
      `player_career_stats` has no columns for. See HANDOFF § 6.1.*
- [x] Emerging section with qualification progress
- [x] `/stats` league leaderboards
- [ ] Player profile career tables, form strip, milestones — *not built; the
      Phase 3 profile page is unchanged.*
- [x] `/ranks/compare` head-to-head radar
- [ ] Sticky "you" rank pill — *needs the signed-in viewer's own player id, and
      `/ranks` is deliberately a session-free public route (it reads over plain
      fetch to stay inside the bundle budget). Adding it means making the page
      auth-aware, which is a real trade, not an oversight.*

**Done when:** E2E flow 8 passes — completing a match updates career stats and
the rankings, and filtering by two teams renumbers correctly while preserving
global ranks as ghost numbers.

> **Status 2026-08-03:** the filtering half of that bar is **tested and
> passing** — `tests/features/ranks/filters.test.ts` asserts renumbering,
> ghost global ranks, and that ratings do not change when filtered. The
> "completing a match updates career stats" half is exercised in pgTAP
> (`14_stats_and_rankings_phase8.sql`) against a real scored match, but **not
> as an end-to-end Playwright flow** — that needs a live backend and a
> session, same gap as flows 5–7. Building this phase also found two scoring
> bugs live since Phase 5; see HANDOFF § 6.4.

---

## Phase 9 — Admin, polish & launch
*Goal: operable by a human, pleasant to use.*

- [~] `/admin/*` — overview counts, match list with re-derive-stats, audit log.
      **Player merge, team admin, grants, rules profiles and data purge are not
      built.** Match *unlock* is deliberately not offered: the lock is enforced
      by a BEFORE UPDATE trigger as well as by RLS, so the button would fail
      silently unless the trigger were taught about it too.
- [ ] Notifications: web push — *needs VAPID keys and a push service; neither
      exists. The `notifications` table is written to, nothing reads it yet.*
- [ ] Empty states with custom illustrations — *every empty state is written
      and says something specific; none has an illustration.*
- [x] Skeleton loaders everywhere
- [~] a11y: skip link, `<main>` landmarks with focus targets, `role="tablist"`
      on every tab strip, `sr-only` text on icon-only controls and on rank
      movement. **No axe run, no screen-reader pass, no keyboard-scoring
      audit** — those need a browser harness this sandbox cannot run.
- [ ] Visual regression suite — *not built.*
- [x] Performance budgets enforced in CI — `size-limit` gates every PR.
- [~] Error taxonomy — `src/lib/errors.ts` classifies everything thrown into
      nine kinds with a sentence each, and `src/lib/monitoring.ts` is the
      reporting seam. **Sentry itself is deliberately not a dependency**: no
      DSN exists to verify against, and its SDK does not fit the audience
      route's remaining budget. Attaching it later is one `setErrorSink` call.
- [x] Data export, account deletion — *deletion raises a request rather than
      erasing; the screen explains why.*
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
