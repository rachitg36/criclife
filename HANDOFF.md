# CricLife — Handoff

**Date:** 2026-08-03
**State:** **Phases 0–6 complete and pushed** to `claude/session-context-ifpggh`.
Phase 7 (audience view) has **not** started.

Read this file, then `CLAUDE.md`. Skip straight to **§ 2** for what to do next.

> **Standing instruction:** update this file at the end of every phase —
> what got built, what got deferred, what's next — so a fresh session (new
> chat, new device, new cloud environment) can pick up cold. Don't wait to
> be asked again.

---

## 1. What this project is

A mobile-first PWA for scoring cricket matches. One person scores from a phone
on a screen that never scrolls; anyone can watch live on a public link; every
match is archived into player stats and rankings. Runs entirely on free tiers.

Decisions already locked in are logged in `docs/13-OPEN-QUESTIONS.md` § A and § E.

---

## 2. Continue here — exact next step

### Next: Phase 7 — audience view

> Start Phase 7: `/live:publicSlug` (public, unauthenticated), the hero with
> count-up score/aurora/team tinting, a Realtime subscription targeting
> <1.5s p95 latency, the ball-by-ball feed, scorecard tab, charts tab (worm,
> manhattan, run-rate, partnerships, wagon wheel), the win-probability bar,
> moments (four/six/wicket/fifty/hundred/maiden/hat-trick/last-over/match-won),
> calm mode + `prefers-reduced-motion`, big-screen `?tv=1` mode, an OG share
> image edge function, and the completed-match replay scrubber.

Or: `/phase` (the skill re-reads the roadmap and confirms Phase 6's
acceptance criteria still pass before building).

Before writing code: **re-verify Phase 6's foundation is still green.**
Container restarts kill the local Postgres server (this sandbox has no
Docker — see § 5.1). Bring it back and re-run the pgTAP suite:

```bash
sudo service postgresql start   # or: sudo pg_ctlcluster <ver> <cluster> start
bash supabase/tests/run-local.sh --seed --pgtap   # expect 155/155 "ok", 0 "not ok"
npm run typecheck && npm run lint && npm run test   # expect 253/253
```

### Why Phase 6 mattered more than it looked

CLAUDE.md's rule 4 ("scoring writes to IndexedDB first, network second — the
pad must never await a request") was already satisfied for the *synchronous*
half since Phase 5: `commitDelivery` applies the pure engine result and calls
`set()` before it ever touches the network. What Phase 6 added was the
*durable* half — a closed tab or a crash between the optimistic `set()` and
the RPC resolving no longer loses that ball's server confirmation, because
every delivery is written to Dexie (`pendingDeliveries`) before the sync
worker ever gets a chance to run, and the sync worker itself is a plain
poll/retry loop with no assumption that the tab survives long enough to see
a request resolve.

### What a fresh session should know about Phase 6's actual risk surface

Phase 6 is the first phase where the *hard* part isn't the happy path — a
single scorer scoring offline and reconnecting works and is tested. The
genuinely load-bearing, still-underverified part is **two scorers
disagreeing**, and specifically:

- The merge screen (`MergeScreen.tsx`) only offers "keep both" or "keep
  theirs" — never a true "keep mine, discard the other scorer's already-
  committed ball," which is deliberately not offered (see § 8.8). If a real
  match ever needs that, today's answer is "undo and re-enter," same as
  every other correction path.
- Every place a drain attempt marks an item `'syncing'` and then can't
  reach a terminal state for it (STALE_SEQ, an item-level conflict, or the
  batch stopping partway through) has to explicitly revert that item back to
  `'queued'`, or it's stuck forever and invisible to the merge-resolution
  helpers. Three instances of exactly this bug were found and fixed this
  phase (§ 6.4) — if you add a fourth error path to `handleBatchLevelError`
  or `handleItemError` in `syncWorker.ts`, check whether it needs the same
  treatment.

---

## 3. If starting from a fresh clone (e.g. a new cloud environment)

```bash
git clone https://github.com/rachitg36/criclife.git
cd criclife
git checkout claude/session-context-ifpggh   # this branch, not main
npm install
```

`.env.local` is gitignored and won't exist in a fresh clone. Recreate it:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with the real values (safe to write directly — these
are publishable/anon-tier keys, meant to be exposed in the browser):

```
VITE_SUPABASE_URL=https://tljbwnbjwgdpmdhvttai.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_oyHY2XoW3H2sk3ckL8JyQA_FLYJD6OM
VITE_APP_ENV=local
VITE_PUBLIC_URL=http://localhost:5173
```

Then verify everything is still green:

```bash
npm run typecheck && npm run lint && npm run test && npm run build && npm run size
```

Local Postgres + pgTAP (see § 5.1 for why this exists instead of `supabase start`):

```bash
sudo service postgresql start
bash supabase/tests/run-local.sh --seed --pgtap   # expect 155/155 "ok", 0 "not ok"
```

(`npm run test:e2e` needs Playwright browsers, and this sandbox only has a
Chromium build whose revision doesn't match the pinned `@playwright/test`
version, and no WebKit at all — see § 5.1's e2e note before assuming
`npx playwright install --with-deps` will get you a working local run.)

To redeploy after any change: `npm run deploy` (builds, then `wrangler
deploy`). First time on a new machine, run `npx wrangler login` first
(browser-based auth, opens dash.cloudflare.com). **Deploys are still manual**
— no CD wiring yet (see § 7).

---

## 4. Live infrastructure reference

| Thing                                                             | Value                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployed app (Phase 0 build only — Phases 1–5 not yet redeployed) | `https://criclife.geminirachit.workers.dev`                                                                                                                                                                 |
| GitHub repo                                                       | `https://github.com/rachitg36/criclife` (public)                                                                                                                                                            |
| Working branch                                                    | `claude/session-context-ifpggh` — all of Phases 1–5 are here, not on `main`                                                                                                                                 |
| is-a.dev PR                                                       | [is-a-dev/register#45746](https://github.com/is-a-dev/register/pull/45746) — still pending merge                                                                                                            |
| Supabase `criclife-prod`                                          | Project ID `tljbwnbjwgdpmdhvttai`, region `eu-central-1`. **No migrations pushed to it yet** — everything so far has run against a local Postgres, not this cloud project.                                  |
| Supabase `criclife-prod` publishable key                          | `sb_publishable_oyHY2XoW3H2sk3ckL8JyQA_FLYJD6OM`                                                                                                                                                            |
| Supabase `criclife-staging`                                       | Project ID `mkzgwwqkwcjcggxuavlr`                                                                                                                                                                           |
| Supabase `criclife-staging` publishable key                       | `sb_publishable_AOlNgi5MClWG1zHMbtofaA_v-Zb0XsE`                                                                                                                                                            |
| Phone auth                                                        | Disabled on both Supabase projects (confirmed, Phase 0)                                                                                                                                                     |
| Google OAuth                                                      | Code-complete (`signInWithOAuth({provider:'google'})` wired in `LoginPage`) but **unverified end-to-end** — no Google Cloud OAuth client exists yet, and this sandbox has no route to real Supabase anyway. |

These are publishable/anon-tier credentials, safe to keep in plain text here
and in `.env.local`. **Never** put a Supabase personal access token, service
role key, or Resend API key in this file or in chat — those go directly into
the relevant dashboard, never through an assistant.

**Important gap:** the `supabase/migrations/*.sql` files have never been run
against either real Supabase project — every verification so far (pgTAP, the
seed script, RLS checks) has been against a scratch local Postgres database
because this sandbox can't reach Docker (needed for `supabase start`) and,
as far as has been tested, can't reach the real Supabase project's Postgres
connection either. **Before real users touch this app, someone with actual
network access needs to run `supabase db push` (or apply the migrations
directly) against `criclife-prod` / `criclife-staging`, then regenerate
`src/types/database.ts` the normal way** (`npx supabase gen types typescript
--linked`) instead of via the introspection-script workaround described in
§ 5.1. This is now a bigger deal than before Phase 5: `record_delivery` and
friends are the endpoints a real scorer's phone will call every six seconds
during a live match — they need to be exercised against real hosted
Postgres, real RLS, and real network latency before anyone trusts them in a
match that matters.

---

## 5. What exists in code

### 5.1 Sandbox limitations that shaped how this got built

Every session so far has hit the same walls, and worked around them the same
way each time — worth knowing before you re-discover them:

1. **No Docker.** `supabase start`, `supabase gen types typescript --local`,
   and `docker pull` all fail (403 from the registry — this sandbox's network
   policy allows npm/jsr/pypi/crates/go-proxy/anthropic.com only). Worked
   around with a **natively-installed PostgreSQL 16 + pgTAP**, driven by
   `supabase/tests/run-local.sh`. This is real, executable verification — not
   a mock — but it's a scratch database (`criclife_test`), recreated from
   scratch on every run, **not** either real Supabase project.
   - `supabase/tests/00_local_auth_stub.sql` fakes the `auth` schema
     (`auth.uid()`, `auth.role()`, `anon`/`authenticated`/`service_role`
     roles) since a bare Postgres install has none of that. **Never** run
     this against a real Supabase project — Supabase already provides the
     real thing.
   - **The local Postgres server does not survive a container restart.**
     If `sudo -u postgres psql` refuses the connection, run
     `sudo service postgresql start` (or `pg_ctlcluster <version> <cluster>
start` — check with `pg_lsclusters`) before anything else.
   - **`psql`'s `:'var'` substitution does not reach inside `$...$`
     dollar-quoted bodies** (DO blocks, function bodies). A pgTAP fixture
     that needs per-iteration state should use repeated top-level statements
     with a fresh inline subquery each time, not a DO-block loop with
     `psql` variables — this cost real debugging time in Phase 5.
2. **`supabase gen types typescript` needs Docker too.** Worked around with a
   custom introspection script: a big `pg_class`/`pg_attribute`/`pg_proc`
   query (`/tmp/.../scratchpad/introspect.sql`, regenerated each session
   since `/tmp` doesn't persist) piped into a hand-written generator
   (`/tmp/.../scratchpad/gen-database-types.mjs`) that produces
   `src/types/database.ts` in the same shape `supabase gen types` would.
   The generator has needed bug fixes across Phases 2–4 (optional/nullable
   RPC args via `pronargdefaults`; array-typed args and `SETOF`-returning
   functions) and, as of Phase 5, **still cannot resolve `returns table(...)`
   shapes** — `search_profiles` and `get_match_grants`'s `Returns` need a
   permanent hand-fix after every regeneration. Re-check its output against
   `\d` on any function whose signature looks off before trusting it blindly.
3. **Playwright's pre-installed Chromium doesn't match the pinned
   `@playwright/test` version, and there is no WebKit at all.** This
   sandbox has `/opt/pw-browsers/chromium-1194` (symlinked at
   `/opt/pw-browsers/chromium`), but `@playwright/test@1.62.1` looks for
   `chromium_headless_shell-1234` by default, and the four mobile projects
   (`iphone-se`, `small-375`, `iphone-14`, `iphone-14-pro-max`) all default to
   WebKit via their device preset (`devices['iPhone SE'].defaultBrowserType`
   etc.), which isn't installed here at any revision. When you need to run
   e2e locally, temporarily add
   `channel: 'chromium'` and `launchOptions: { executablePath:
   '/opt/pw-browsers/chromium' }` to the top-level `use` block in
   `playwright.config.ts`, run `--project=desktop` only, then **revert the
   config change** — don't leave it committed. Real CI
   (`.github/workflows/ci.yml`) runs `npx playwright install --with-deps
   chromium webkit` fresh and is unaffected by any of this.

### 5.2 Documentation — complete, 15 files in `docs/`

`docs/README.md` is the index. Docs are the spec — when code and docs
disagree, that's been called out explicitly per phase (see § 6.4) rather than
silently picked one way.

### 5.3 Phase 1 — the rules engine (`src/engine/`)

Pure functional core: `types.ts`, `config.ts` (6 built-in rules profiles: T20,
ODI, T10, The Hundred, Gully 8, custom), `applyDelivery.ts` (the 13-step
algorithm), `strike.ts`, `dismissals.ts`, `inningsEnd.ts`, `result.ts`,
`replay.ts`, `scorecard.ts`, `projections.ts`, `commentary.ts`.

**100% branch/function/line/statement coverage**, enforced by a
`vitest.config.ts` threshold gate on `src/engine/**`.

### 5.4 Phase 2 — data layer & auth

- `supabase/migrations/` — extensions/enums → identity/teams → matches/grants
  → deliveries log → stats/audit → functions/triggers → RLS policies →
  `claim_player` RPC. Every table has RLS enabled, deny-by-default.
- `supabase/seed.sql` — 4 teams, 44 shadow players, 1 Super Admin. Local-dev
  only by Supabase CLI convention; never runs against a linked cloud project.
- `src/lib/supabase.ts`, `src/app/providers/queryClient.ts` — typed client +
  TanStack Query, tuned for flaky connectivity at a cricket ground.
- `src/features/auth/` — `AuthProvider`, `authContext.ts`, `useProfile.ts`,
  `LoginPage` (magic link + Google), `AuthCallbackPage`, `OnboardingPage`.
- `src/app/guards/RequireAuth.tsx`, `RequireSuperAdmin.tsx`.
- Router: `AuthedOutlet` (lazy) scopes `AuthProvider` — and the
  `@supabase/supabase-js` it drags in — to only the branches that need a
  session, so the audience bundle stays auth-free.

### 5.5 Phase 3 — teams, players & self-managed roles

- Migration adds `create_team`, `create_shadow_player`, `search_profiles`,
  `add_existing_profile_to_team`, `suggest_role_change`,
  `respond_to_role_suggestion`, `transfer_team_ownership`, `archive_team`.
- Screens: `/teams`, `/teams/new`, `/teams/:teamId` (+ `/squad`),
  `/teams/:teamId/add-player`, `/teams/:teamId/settings`,
  `/players/:playerId`, `/players/:playerId/edit`, `/players/claim`.
- Router grows a **second public branch**: `PublicAuthedOutlet` (lazy) —
  team/player pages are public-read but need to know the viewer's session
  without pulling `supabase-js` into the strict anonymous audience bundle.

### 5.6 Phase 4 — match setup & the scoring token

- Migration adds `create_match`, `set_toss`, `set_playing_xi`,
  `start_innings`, `issue_scoring_grant`, `revoke_scoring_grant`,
  `transfer_scoring_grant`, `create_handoff_token`, `redeem_handoff_token`,
  `get_match_grants`.
- New table not in `docs/02`: `handoff_tokens` (RLS enabled, **zero**
  policies — only the two handoff RPCs ever touch it).
- Screens: `/matches/new`, `/matches/:matchId` (hub), `/matches/:matchId/setup`,
  `/matches/:matchId/rights` (Scoring Rights Map), `/redeem-grant/:token`.

### 5.7 Phase 5 — the scorer view

- **Migration** (`20260802150000_scoring_rpcs.sql`) adds the
  `crossed_before_dismissal` column `docs/04` needed but `docs/02` never
  defined, fixes a real super-over batting-team bug in Phase 4's
  `start_innings`, and adds `record_delivery`, `undo_last_delivery`,
  `edit_delivery`, `end_innings`, `complete_match`. `record_delivery`
  deliberately re-validates only the security/integrity-critical subset
  (legality, seq, grants, lock, free-hit dismissal gate, bowler limits,
  consecutive-over) rather than the engine's full dismissal table — "the
  client engine is for speed; the server is for truth," not "the server
  re-implements the client." Also fixed: `deliveries_innings_seq_idx` made
  partial (`where not is_deleted`) — without this, `edit_delivery`'s
  documented "insert a correction at the same `seq`" would have failed in
  production, not just in a hypothetical.
- **`src/features/scoring/store.ts`** — the Zustand store that is the
  scorer's single source of live state. `commitDelivery` applies the pure
  engine result and calls `set()` **before** the `record_delivery` RPC is
  even sent — CLAUDE.md rule 4's "never await a request" holds today, ahead
  of Phase 6's Dexie durability layer, and is asserted directly in
  `tests/features/scoring/store.test.ts` (call `recordRun()` without
  awaiting it, then check the state synchronously in the same tick).
- **The pad** (`src/features/scoring/components/`): `StatusStrip`,
  `ScoreBlock`, `BattersRow`, `BowlerRow`, `OverStrip`, `RunPad`,
  `ModifierRow`, `ActionRow`, `WicketSheet` (free-hit gates every tile
  except `RUN OUT`/`OBSTRUCTING`), `OpenersPicker`, `BowlerPicker`
  (excludes the previous over's bowler and anyone at their over limit),
  `BatterPicker`, `BallHistorySheet` (run corrections only — see § 6.2),
  `InningsBreakScreen`, `MatchOverScreen`, and the sub-tabs `ScorecardTab`,
  `MapTab` (reuses `ScoringRightsMapPage` as-is), `FeedTab`, `SettingsTab`.
- **`ScorerRoute.tsx`** composes all of the above by `mode`
  (`docs/05` § 5's state table) and by `scorerTab` — the active tab lives in
  the store, not the route, so switching tabs never touches the pad's state.
- **`RequireScoringGrant.tsx`** is real: checks `can_score(match_id,
  auth.uid())` via RPC, subscribes to `scoring_grants` over Realtime for
  live revocation, and — this matters, see § 6.4 — deliberately does **not**
  sit behind the usual `<RequireAuth>`. It folds "not signed in" into its
  own render instead, because `RequireAuth`'s `<Navigate>` would unmount
  `ScoringLayout` itself, breaking the no-scroll shell for anyone without a
  session (which, before a live Supabase project is wired up, is every CI
  run — see § 4 and § 6.4).
- **Haptics** (dot/runs/boundary/wicket/error) fire from `commitDelivery`
  itself, not the UI layer. **Handedness mirroring** swaps `WICKET`/`UNDO`
  sides in `ActionRow` per `uiStore.scorerHand`. **Wake lock**
  (`src/lib/wakeLock.ts`) re-acquires on `visibilitychange`, with a small
  indicator in `StatusStrip`. **Accidental-tap guard**: a real bug was found
  and fixed here — the guard originally compared against
  `input.clientDeliveryId`, a fresh random UUID every call, so it could
  never actually match and was silently inert. Fixed to key on the tap's
  content (runs/extra/wicket fields), with the 250–600ms window now
  surfacing the documented "Recorded twice? Undo" chip.

### 5.8 Phase 6 — offline & concurrency

- **Migration** (`20260803120000_offline_sync.sql`) extracts `record_delivery`'s
  per-ball validation+insert logic into a private `_insert_scored_delivery`
  helper, then adds `record_deliveries_batch` — the RPC the sync worker
  actually drains against. It does the grant/lock/innings-status/seq-staleness
  checks **once per batch** (against the batch's first item only — `seq` is a
  single global sequence, and nothing else can write mid-transaction), then
  loops over the batch calling the shared helper inside a nested
  `begin...exception...end` block (an implicit savepoint), so an earlier
  item's success in the same call survives a later item's failure.
  `record_delivery`'s own external behavior is unchanged — verified by
  re-running Phase 5's pgTAP file unmodified against the refactored function.
- **`src/lib/db.ts`** — Dexie's `pendingDeliveries` table (a Phase 0 scaffold)
  is now load-bearing: every delivery is written here, with a
  client-generated `clientDeliveryId`, before anything touches the network.
  Two different "what's outstanding" queries exist on purpose:
  `queuedForInnings` (status `queued`/`error` — what the drain reads next)
  and `unresolvedForInnings` (adds `syncing` — is anything not yet settled).
  Conflating them was the root cause of three real bugs this phase (see
  § 6.4) — a drain in flight is invisible to `queuedForInnings` but must
  still be found by the merge-resolution actions and by a second ball
  deciding whether it's starting a new offline streak.
- **`src/lib/syncWorker.ts`** — framework-free (pub/sub via
  `subscribeSyncEvents`, no direct Zustand import) so it's testable in
  isolation. `enqueueDelivery` writes to Dexie then fires `kickSync`
  (fire-and-forget, never awaited by the caller — CLAUDE.md rule 4).
  `drainMatch`/`drainInnings` batch up to 50 items per innings against
  `record_deliveries_batch`, with exponential backoff (1s→30s) on retryable
  errors. `discardQueuedForInnings` ("Keep theirs") and
  `retryQueuedForInnings` ("Keep both", re-anchors to the current server seq)
  back the merge screen. A true "keep mine" — discarding a ball another
  scorer has already had confirmed by the server — is deliberately **not**
  offered anywhere; see § 8.8.
- **Soft locks** (`docs/03` § 3.6): opening the wicket sheet broadcasts
  `{profileId, displayName, action, ttl}` over a Supabase Realtime channel
  (`scorer-soft-lock:{matchId}`); other scorers on the same match see a
  dimmed pad and an "X is entering a wicket…" banner for 8s.
- **`MergeScreen.tsx`** — blocks the whole pad on conflict, since with the
  ball order genuinely uncertain nothing else is safe to render. Resolves at
  the level of "this device's whole run of unsynced balls for the innings,"
  not a full ball-by-ball diff against the server's sequence — the latter is
  real additional work, deliberately not half-built here (see § 8.8).
- **`ReviewTrayPage.tsx`** (`/matches/:matchId/review`) — replaces the Phase 4
  stub. Lists `rejected`-status Dexie rows reactively via
  `dexie-react-hooks`' `useLiveQuery`, with per-item and bulk discard. There's
  no way to auto-hand a rejected ball to whoever now holds scoring rights —
  Dexie is local to the device — so the page links to the Scoring Rights Map
  and leaves the hand-off manual.
- **`UpdatePrompt.tsx`** (mounted in `RootLayout`, so on every route) blocks
  the "Reload to update" prompt until `pendingCount()` (global, not scoped to
  the current match — a scorer might have queued balls regardless of route)
  reaches zero. Statically imports only `@/lib/sw`; `@/lib/db` is a dynamic
  import inside the effect, so Dexie never rides the eager main chunk despite
  this component being mounted everywhere.
- **Workbox caching** — split the single fonts+images `runtimeCaching` rule
  into two, matching `docs/09` § 5's table exactly: `criclife-fonts`
  (CacheFirst, 1 year) and `criclife-images` (CacheFirst, 30 days/200
  entries) — Phase 0 had merged them into one bucket.
- **`fake-indexeddb`** is a new devDependency (`tests/setup.ts` now does
  `import 'fake-indexeddb/auto'`) — jsdom has no real IndexedDB, and Dexie
  now runs for real (not mocked) in every test that touches the scorer store
  or the sync worker.

### 5.9 Current verification numbers (all re-confirmed at end of Phase 6)

| Check                                                   | Result                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| pgTAP                                                   | **155/155** ("not ok": 0) across 12 files in `supabase/tests/pgtap/`                                                        |
| Unit/component tests (`npm run test`)                   | **253/253** across 25 files, confirmed clean across 6+ repeated full-suite runs (no flakiness)                             |
| `npm run typecheck` / `npm run lint`                    | clean                                                                                                                        |
| `npm run build` + `npm run size`                        | audience route **173.83 kB** brotli, budget 180 kB                                                                          |
| e2e (`npm run test:e2e`, desktop/Chromium project only) | **9 passed, 4 intentionally skipped** — with the local `channel`/`executablePath` override from § 5.1, not committed        |
| e2e, the four mobile/WebKit viewports                   | **could not run in this sandbox** — no WebKit binary at all (see § 5.1); real CI installs it fresh and is not affected      |
| E2E flows 5/6/7 (`docs/09` § 9 — the Phase 6 acceptance bar) | **not run as actual Playwright specs** — see § 8.9. Verified instead at the unit/integration layer against a mocked RPC (`tests/lib/syncWorker.test.ts`), which is the closest this sandbox can get without a live, multi-context, network-throttled Supabase backend |

---

## 6. Missing on purpose / deferred, with why

### 6.1 Whole features, by phase

| Thing                                                                        | Why                                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| The audience view (`/live/:publicSlug`), charts, moments, replay scrubber   | Phase 7 — next up, see § 2                                                     |
| Advanced Mode (shot/pitch overlay after each ball)                          | `docs/05` § 8 explicitly says off by default and not a Phase 5 roadmap bullet |
| Full wicket-edit UI in `BallHistorySheet`                                   | `edit_delivery` supports it server-side; only run corrections are wired client-side — see § 6.2 |
| The `⋯` overflow's rarer actions (retire batter, declare, abandon, penalty runs, drinks interval, correct the over count) | Not named Phase 5 roadmap bullets; `⋯` currently only reaches ball history/edit |
| `/matches` (list: Live · Upcoming · Completed)                              | Not an explicit roadmap bullet yet; still a `<Placeholder>`                    |
| `/matches/:matchId/settings`                                                 | Phase 4 per roadmap; still a stub                                              |
| `/teams/:teamId/matches`, `/teams/:teamId/stats`, `/ranks/compare`, `/stats` | Phase 8 (stats/rankings) — stubs                                               |
| Most of `/settings/*` (only `/settings/appearance` is real)                  | Phase 9                                                                        |
| `/admin/*`                                                                   | Phase 9                                                                        |
| Real file upload for team logos / player photos                              | URL fields only; no storage wiring yet                                       |
| A true ball-by-ball merge diff (server sequence vs. this device's queue, side by side) | The merge screen resolves at the innings level instead — see § 6.2 and § 8.8 |
| A "keep mine" merge-resolution action (discard the *other* scorer's already-committed ball) | Deliberately never offered — see § 8.8 |
| E2E Playwright specs for roadmap flows 4 through 8 (token handoff, concurrent scoring, offline sync, revoked-grant review, post-match stats) | Only flows 1–3-adjacent smoke/viewport checks exist as actual Playwright specs; the rest are verified at the unit/component layer against mocked RPCs — see § 8.9 |

### 6.2 Simplifications inside phases that did ship

- **`BallHistorySheet` only corrects runs**, not the wicket. `edit_delivery`
  supports replacing the wicket fields too, but a full re-dismissal picker
  would duplicate `WicketSheet`'s own multi-step flow; undo-and-re-enter is
  the documented fallback for anything bigger than a run count anyway.
- **`MapTab` reuses `ScoringRightsMapPage` verbatim** rather than a
  pad-specific rebuild — same component, same `useParams` resolution, since
  the scorer route already lives at `/matches/:matchId/score`.
  `SettingsTab` exposes only the `uiStore` prefs (theme, haptics, hand,
  sound, wake lock, advanced-scoring toggle) and links out to the existing
  `/matches/:matchId/settings` stub for match-config fields, rather than
  guessing which config fields docs never named as "live-editable."
  `ScorecardTab`/`FeedTab` are built directly against the engine's
  `buildInningsScorecard`/the store's `deliveries` log — no new RPCs needed.
- **`tests/e2e/scorer-no-scroll.spec.ts`'s 44px-button-target test is
  skipped**, not deleted. It needs a seeded match plus an authenticated
  session holding a scoring grant to reach `mode: 'READY'` and render the
  real pad — that needs a live Supabase project, same class of gap as
  Phase 0's already-skipped theme-toggle tests.
- **Batting order reordering** in the XI setup screen (Phase 4) is
  up/down-style selection, not full drag-and-drop. **The Scoring Rights
  Map's graph view** (Phase 4) is a real but intentionally simple radial SVG
  layout. **Handoff QR** (Phase 4) redeems via URL, not an in-app scanner.
- **`MergeScreen` resolves conflicts at the innings level**, not `docs/05`
  § 6.6's full "both sequences side by side, ball by ball" spec — see § 8.8.
- **No "keep mine" merge-resolution action.** Only "keep both" (re-anchor and
  retry after the other scorer's balls) and "keep theirs" (discard mine) are
  offered. Discarding a ball the server has already confirmed for another
  scorer is a strictly more destructive, cross-user action than anything
  else in the merge flow, and undo-and-re-enter already exists as the
  general-purpose correction path — see § 8.8.

### 6.3 Human-only tasks — status (unchanged since Phase 0 unless noted)

- [x] Deploy to Cloudflare Workers — live at `criclife.geminirachit.workers.dev`
      (**still the Phase 0 build** — Phases 1–6 haven't been redeployed; see § 4)
- [x] Push to GitHub as a public repo
- [x] Open the is-a.dev PR — still pending merge
- [x] Create both Supabase projects
- [x] Disable phone auth on both
- [x] Resend account, wired as custom SMTP on both projects
- [x] Add `SUPABASE_URL` / `SUPABASE_ANON_KEY` as GitHub Actions secrets
- [x] Run the keepalive workflow once manually — succeeded
- [x] CI green on all four jobs (Phase 0 baseline)
- [ ] **New, blocking real usage:** push `supabase/migrations/*.sql` to
      `criclife-prod` (and/or `criclife-staging`) — nothing has run against
      either real project yet (see § 4). This now includes `record_delivery`,
      `record_deliveries_batch`, and the rest of the scoring RPCs — the
      endpoints a real match depends on every ball, offline or not.
- [ ] (Optional, deferred) Google OAuth client — code is ready, needs a
      Google Cloud project + credentials
- [ ] (Follow-up) Merge of is-a.dev PR, then add the custom domain to the Worker
- [ ] (Follow-up) CD workflow so pushes to `main` redeploy — currently manual
- [ ] Verify Add-to-Home-Screen on a real phone — never tested on a device
- [ ] Score a real 20-over match on a real phone end to end — the literal
      Phase 5 "Done when" bar; unverifiable in this sandbox (no device, no
      live backend) and not yet done by a human either

> The keepalive matters. Free Supabase projects pause after 7 idle days and need
> a manual dashboard click plus a 60s cold start to wake.

### 6.4 Gaps in the docs found and closed while building (so nobody re-discovers them as bugs)

Each of these is a place where the docs described a capability but the
schema, RLS, or router as literally specified couldn't actually support it,
or where a genuine bug was found and fixed. All are called out with a
comment at the top of the relevant file too.

| Gap                                                                                                                             | Where it lives | Fix                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| Shadow player claiming: no policy can move `profile_id` from null to a real user                                                | Phase 2        | `claim_player` RPC (security definer)                                                                       |
| Creating a team is chicken-and-egg                                                                                              | Phase 3        | `create_team` RPC does both atomically                                                                      |
| "Invite an existing user" needs to search locked-down `profiles`                                                                | Phase 3        | `search_profiles` RPC — narrow, authenticated-only                                                          |
| "Archive team" is owner-only, stricter than the general update policy                                                          | Phase 3        | `archive_team` / `transfer_team_ownership` RPCs enforce the tighter rule directly                          |
| Handoff QR has no backing table in `docs/02`                                                                                    | Phase 4        | New `handoff_tokens` table, RLS enabled with zero policies                                                  |
| Scoring Rights Map needs grant holders' names, but `profiles` is locked down                                                    | Phase 4        | `get_match_grants` RPC                                                                                      |
| `start_innings` doesn't persist openers — `innings` has no column for it pre-first-ball                                        | Phase 4        | Openers are the scorer pad's job, as the first `deliveries` row                                             |
| The engine needs `crossed_before_dismissal` on a run-out replay, but neither `docs/02` nor the original migration defined it   | Phase 5        | Added the column                                                                                            |
| Phase 4's `start_innings` super-over batting-team logic only worked by coincidence for innings 2, was wrong for innings ≥ 3     | Phase 5        | Real-cricket rule: the team that bowled first in innings 1 bats first in the super over, alternating on repeat ties |
| `deliveries_innings_seq_idx` (not partial) would have made `edit_delivery`'s documented same-`seq` replacement fail in production | Phase 5        | Made the index partial: `where not is_deleted`                                                              |
| The accidental-tap guard compared `clientDeliveryId` — a fresh UUID every call — against itself, so it could never match and was silently inert | Phase 5 | Rekeyed on the tap's content (runs/extras/wicket fields), not its generated id |
| Wrapping the scorer route in the same `<RequireAuth>` as every other authed screen breaks `docs/05` § 3's "the shell always renders": `RequireAuth`'s `<Navigate>` on redirect swaps out `ScoringLayout` itself, not just its content | Phase 5 | `RequireScoringGrant` absorbs the "not signed in" case into its own render (still inside `ScoringLayout`); the scorer route is deliberately not behind `<RequireAuth>` |
| Anything a static import in `router.tsx` pulls in rides the eager main chunk — `RequireScoringGrant` naively importing `supabase`/the store blew the bundle-size budget by 36 kB | Phase 5 | Both are dynamically imported inside the guard's effect instead |
| `kickSync`'s fire-and-forget `drainMatch(matchId)` call had no `.catch()` — any rejection (including one only reachable in a test's torn-down mock context) became a genuinely unhandled promise rejection, not just test flakiness | Phase 6 | Wraps the call in `.catch()`, emitting an `error` event instead of letting it escape |
| Three separate places left a Dexie row stuck at `'syncing'` forever whenever a drain attempt marked it `'syncing'` but then couldn't reach a terminal state for it: `drainInnings` when the batch RPC's `results` array is shorter than the batch (the documented "stops at first hard error" case), `handleBatchLevelError`'s `STALE_SEQ` branch, and `handleItemError`'s per-item conflict branch (`ILLEGAL_DISMISSAL`/`CONSECUTIVE_OVER`/`BOWLER_LIMIT`/`INNINGS_COMPLETE`) | Phase 6 | All three now explicitly reset the affected row(s) back to `'queued'` before returning/emitting, so the merge-resolution helpers (which query unresolved rows) can actually find and act on them |
| `queuedForInnings` (status `queued`/`error`) was used everywhere "is there unresolved work for this innings" was actually the question — but it excludes `'syncing'`, so a ball enqueued while a drain of an earlier ball was already in flight would race, and the merge-resolution actions couldn't find a ball mid-drain | Phase 6 | Added `unresolvedForInnings` (adds `'syncing'`) as the distinct "is anything not yet settled" query; `enqueueDelivery`'s streak-anchor detection and both merge-resolution helpers now use it, while `drainInnings` itself correctly keeps using `queuedForInnings` ("what to send next") |
| Bundle-size budget: wiring Dexie into the scorer store pulled `db-*.js` (97 kB) into the audience-route `size-limit` measurement, since a new lazy chunk isn't excluded until someone adds it to the config | Phase 6 | Added `!dist/assets/db-*.js` to the exclusion list, same pattern as the existing lazy-chunk exclusions |

---

## 7. Decisions worth not re-litigating

Reasoning is in `docs/13-OPEN-QUESTIONS.md` § A. Short version:

| Decision                                              | Because                                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| PWA, not React Native                                 | No app stores wanted; one codebase serves phone, laptop and the TV at the ground                                     |
| Supabase over Firebase                                | The scoring token is a row-level auth problem — that's what Postgres RLS is for. Rankings are aggregate SQL.         |
| Cloudflare (Workers Static Assets) over Vercel        | Vercel Hobby is non-commercial and caps at 100 GB, then **pauses your site**. Terrible failure mode for live scores. |
| Rules engine before UI                                | Only part where a mistake is expensive to undo, and it needs no design decisions                                     |
| Undo by replay, not reversal                          | Reversal logic is where scoring apps get subtly wrong.                                                               |
| Append-only delivery log                              | Disputed scores are the #1 social problem in amateur cricket                                                         |
| "Scoring map" = a rights topology graph               | Best reading of the request; the wagon wheel is separately planned as Advanced Mode                                  |
| Team admins can only _suggest_ roles                  | Owner said players own their roles                                                                                   |
| Exponential decay ranking, 20-match half-life         | Recent form should matter; one lucky innings shouldn't top the board                                                 |
| Local Postgres + pgTAP instead of `supabase start`    | This sandbox has no Docker; see § 5.1. Deliberate, disclosed deviation — not silently swapped for a mock.            |
| Handoff QR encodes a URL, not a custom in-app scanner | Any phone camera already handles it; see § 6.2.                                                                      |
| `record_delivery` re-validates a critical subset server-side, not the engine's full ruleset | Avoids maintaining two copies of a 37-case dismissal table in two languages; the TS engine is already 100%-covered. |
| The active scorer tab lives in Zustand, not the route | `docs/05` § 7 requires tapping away and back to restore the pad instantly; a route change would remount it.          |
| The scorer route skips `<RequireAuth>` in favour of `RequireScoringGrant` handling "signed out" itself | The alternative unmounts `ScoringLayout` on redirect, breaking the no-scroll guarantee for anyone without a session — see § 6.4. |
| `record_deliveries_batch` checks staleness once per batch (against the first item only), not once per item | `seq` is one global Postgres sequence, and nothing else can write mid-transaction — a per-item check would be redundant work for the same answer. |
| The sync worker is framework-free (pub/sub events, no direct Zustand import) | Keeps it independently testable and reusable; the store subscribes to it rather than the worker depending on the store. |
| Merge-resolution "keep both"/"keep theirs" only, never "keep mine" | Discarding another scorer's server-confirmed ball is categorically more destructive than anything else in the app; undo-and-re-enter is the existing fallback — see § 8.8. |

Still open, none blocking: who can create teams (B2), tournaments in v1 (B4),
a team ladder as well as player ranks (B6), web push in v1 (B8), importing
historic matches (B9).

---

## 8. Things I'd want a second opinion on

Genuine uncertainty, not false modesty:

1. **The rating formula constants** in `docs/07` § 2 are invented. They're
   plausible but untuned. They need a season of real data.
2. **The win-probability heuristic** is a placeholder shipped with an "estimate"
   label. Fine, but don't let it look authoritative.
3. **The scorer layout budget** was computed on paper and passes the
   Chromium-based no-scroll assertion at 320×568 through 430×932 in this
   sandbox — but it has **never once rendered in an actual WebKit engine**,
   let alone a real phone. WebKit's `dvh` and safe-area handling has
   historically had its own quirks; this is a real, unverified risk, not
   just a formality.
4. **Concurrent multi-scorer conflict handling is now built, but only
   exercised at the unit/component layer against a mocked RPC** — see § 8.9.
   `commitDelivery`'s previous "resync and silently prefer the server"
   behavior is gone; there's a real merge screen now. What's still unverified
   is the actual multi-device, real-network-latency version of the scenario.
5. **`exactOptionalPropertyTypes`** has needed a few explicit
   `...(x ? {y} : {})` spreads through Phase 5 (RPC payloads, `WicketInput`)
   rather than being pure friction — still seems worth keeping, but the
   pattern is worth knowing before you hit it fresh.
6. **None of Phases 1–6 have run against a real Supabase project** — every
   green checkmark in § 5.9 is against a local scratch Postgres. The scoring
   and sync RPCs are the endpoints a live match calls every six seconds,
   offline or not; "it passed pgTAP locally" and "it works against real
   hosted Postgres with real network latency and the real `auth` schema,
   under concurrent writers" are not the same claim. Push to
   `criclife-staging` and re-run before trusting this in front of real users.
7. **The accidental-tap guard and the 250–600ms "Recorded twice?" chip are
   unit-tested with fake timers, not felt on a real touchscreen.** The
   thresholds (250ms / 600ms) are the ones docs specify, but whether they
   feel right on an actual phone under actual thumb pressure hasn't been
   checked outside this sandbox.
8. **The merge screen and "keep mine" are real, deliberate simplifications,
   not TODOs in disguise — but they're worth someone re-checking against how
   an actual disputed-scoring argument plays out at a ground.** `docs/05`
   § 6.6 specs a full ball-by-ball diff (server sequence next to this
   device's queue); what shipped instead resolves at "this device's whole
   unsynced run for the innings" — enough to unblock the pad, not enough to
   show a scorer exactly which of their balls conflicts with which of the
   other scorer's. And there is no way at all to discard the other scorer's
   already-committed ball, even when the scorer holding the device is
   confident theirs is right — that always requires falling back to
   undo-and-re-enter after the fact. Both were deliberate calls under the
   phase's time box, not oversights, but "deliberate" isn't the same as
   "definitely correct" — flagging for a second opinion once this sees a
   real disputed over.
9. **E2E flows 5, 6, and 7 (`docs/09` § 9) — the actual Phase 6 "Done when"
   bar — were not run as Playwright specs.** They need two browser contexts
   (or two devices), real offline/online network transitions, and a live
   Supabase backend with real RLS and real latency; none of that exists in
   this sandbox (see § 5.1), and no such specs exist yet in `tests/e2e/`
   even as a scaffold. What stands in for them today is
   `tests/lib/syncWorker.test.ts`, which drives the same code paths
   (STALE_SEQ, NO_GRANT, batch duplicate/partial-failure handling) against a
   mocked `record_deliveries_batch` — a real test of the client-side state
   machine, but not a claim that flows 5/6/7 have ever been seen to pass
   end-to-end. Don't report Phase 6 as fully done against docs' own bar
   without someone running these for real first.

---

## 9. File map

```
criclife/
├─ CLAUDE.md              ← project memory, auto-loaded by Claude Code
├─ HANDOFF.md             ← this file — update after every phase
├─ README.md              ← public-facing overview
├─ SETUP.md               ← the human account steps
├─ wrangler.jsonc         ← Cloudflare Workers static-assets deploy config
├─ docs/                  ← 15 planning docs, README.md is the index
├─ src/
│  ├─ engine/             ← Phase 1 — pure rules engine
│  ├─ app/                ← router, providers, layouts, guards
│  ├─ features/
│  │  ├─ auth/            ← Phase 2 — login, callback, onboarding
│  │  ├─ teams/           ← Phase 3
│  │  ├─ players/         ← Phase 3
│  │  ├─ matches/         ← Phase 4; ReviewTrayPage.tsx is Phase 6
│  │  ├─ scoring/         ← Phase 5 — store.ts, ScorerRoute.tsx, components/
│  │  │                      (MergeScreen.tsx is Phase 6)
│  │  ├─ home, settings, audience, ranks, admin, system
│  ├─ components/ui/      ← Button Card Skeleton CountUp Aurora LivePill
│  │                         ThemeToggle Crest Avatar
│  ├─ components/system/  ← UpdatePrompt.tsx (Phase 6)
│  ├─ lib/                ← env supabase db(Dexie) theme haptics format cn sw
│  │                         wakeLock (Phase 5), syncWorker (Phase 6)
│  ├─ stores/             ← zustand uiStore
│  ├─ styles/             ← tokens.css globals.css animations.css
│  └─ types/database.ts   ← generated (see § 5.1 for how, since no Docker)
├─ supabase/
│  ├─ migrations/         ← Phases 2–6, 12 files, chronologically ordered
│  ├─ seed.sql            ← local-dev only, never runs against cloud
│  └─ tests/
│     ├─ run-local.sh     ← the local Postgres+pgTAP harness — see § 5.1
│     ├─ 00_local_auth_stub.sql  ← LOCAL ONLY, never push to real Supabase
│     └─ pgtap/           ← 12 files, 155 assertions
├─ tests/
│  ├─ engine/             ← Phase 1 — 100%-covered pure engine tests
│  ├─ features/           ← auth, matches, players, scoring component tests
│  │                         (MergeScreen.test.tsx, ReviewTrayPage.test.tsx — Phase 6)
│  ├─ lib/                ← unit tests, incl. syncWorker.test.ts (Phase 6)
│  ├─ e2e/                ← Playwright (no-scroll gate, viewport gate, smoke) —
│  │                         no specs yet for roadmap flows 4–8, see § 8.9
├─ public/                ← icons, manifest assets, fonts README
├─ scripts/               ← generate-icons.py
└─ .github/workflows/     ← ci.yml, keepalive.yml
```
