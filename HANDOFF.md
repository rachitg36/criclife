# CricLife — Handoff

**Date:** 2026-08-03
**State:** **Phases 0–5 complete and pushed** to `claude/session-context-ifpggh`.
Phase 6 (offline & concurrency) has **not** started.

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

### Next: Phase 6 — offline & concurrency

> Start Phase 6: build the Dexie schema + write-first-locally delivery path,
> a sync worker with backoff/batching/idempotency, the sync-pill states
> (synced/pending/offline/error), `STALE_SEQ` conflict handling + the merge
> screen, soft locks between co-scorers, the Review Tray, and block the
> service-worker update while scoring or while the queue is non-empty.

Or: `/phase` (the skill re-reads the roadmap and confirms Phase 5's
acceptance criteria still pass before building).

Before writing code: **re-verify Phase 5's foundation is still green.**
Container restarts kill the local Postgres server (this sandbox has no
Docker — see § 5.1). Bring it back and re-run the pgTAP suite:

```bash
sudo service postgresql start   # or: sudo pg_ctlcluster <ver> <cluster> start
bash supabase/tests/run-local.sh --seed --pgtap   # expect 163/163 "ok", 0 "not ok"
npm run typecheck && npm run lint && npm run test   # expect 235/235
```

### Why Phase 6 matters more than it looks

CLAUDE.md's rule 4 ("scoring writes to IndexedDB first, network second — the
pad must never await a request") is **already satisfied for the synchronous
half**: Phase 5's `commitDelivery` applies the pure engine result and calls
`set()` before it ever touches the network. What's still missing is the
*durable* half — right now, a closed tab or a crash between the optimistic
`set()` and the `record_delivery` RPC resolving loses that ball's server
confirmation with no local record to replay from. Dexie is what makes "score
a whole match with no signal" actually true rather than "true until your
battery-saver kills the tab."

Two things Phase 6 will need that don't exist yet:

- **A `client_delivery_id`-keyed local queue.** The column already exists on
  `deliveries` and `record_delivery` already treats a duplicate id as a
  no-op success (`docs/10` § 3.1) — the idempotency contract Phase 6 needs is
  already in place server-side. What's missing is the client-side queue that
  actually retries against it.
- **A merge screen for `STALE_SEQ`.** `record_delivery` already rejects a
  stale `expectedSeq` (tested in `supabase/tests/pgtap/11_scoring_rpcs_phase5.sql`),
  and `commitDelivery` already resyncs via `init()` on any RPC error —
  but that resync silently prefers server truth. The "Keep mine / Keep
  theirs / Keep both" UI in `docs/05` § 6 doesn't exist yet.

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
bash supabase/tests/run-local.sh --seed --pgtap
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

### 5.8 Current verification numbers (all re-confirmed at end of Phase 5)

| Check                                                   | Result                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| pgTAP                                                   | **163/163** ("not ok": 0) across 11 files in `supabase/tests/pgtap/`                                                        |
| Unit/component tests (`npm run test`)                   | **235/235** across 22 files                                                                                                 |
| `npm run typecheck` / `npm run lint`                    | clean                                                                                                                        |
| `npm run build` + `npm run size`                        | audience route **170.3 kB** brotli, budget 180 kB                                                                           |
| e2e (`npm run test:e2e`, desktop/Chromium project only) | **9 passed, 4 intentionally skipped** — with the local `channel`/`executablePath` override from § 5.1, not committed        |
| e2e, the four mobile/WebKit viewports                   | **could not run in this sandbox** — no WebKit binary at all (see § 5.1); real CI installs it fresh and is not affected      |

---

## 6. Missing on purpose / deferred, with why

### 6.1 Whole features, by phase

| Thing                                                                        | Why                                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Dexie / IndexedDB durable queue, sync worker, merge screen, Review Tray      | Phase 6 — Phase 5 satisfies "never await the network" synchronously, but there's no durable local log yet |
| Advanced Mode (shot/pitch overlay after each ball)                          | `docs/05` § 8 explicitly says off by default and not a Phase 5 roadmap bullet |
| Full wicket-edit UI in `BallHistorySheet`                                   | `edit_delivery` supports it server-side; only run corrections are wired client-side — see § 6.2 |
| The `⋯` overflow's rarer actions (retire batter, declare, abandon, penalty runs, drinks interval, correct the over count) | Not named Phase 5 roadmap bullets; `⋯` currently only reaches ball history/edit |
| `/matches` (list: Live · Upcoming · Completed)                              | Not an explicit roadmap bullet yet; still a `<Placeholder>`                    |
| `/matches/:matchId/settings`, `/matches/:matchId/review`                     | Phase 4/6 respectively per roadmap; stubs                                      |
| `/teams/:teamId/matches`, `/teams/:teamId/stats`, `/ranks/compare`, `/stats` | Phase 8 (stats/rankings) — stubs                                               |
| Most of `/settings/*` (only `/settings/appearance` is real)                  | Phase 9                                                                        |
| `/admin/*`                                                                   | Phase 9                                                                        |
| Real file upload for team logos / player photos                              | URL fields only; no storage wiring yet                                       |

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

### 6.3 Human-only tasks — status (unchanged since Phase 0 unless noted)

- [x] Deploy to Cloudflare Workers — live at `criclife.geminirachit.workers.dev`
      (**still the Phase 0 build** — Phases 1–5 haven't been redeployed; see § 4)
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
      either real project yet (see § 4). This now includes `record_delivery`
      and the rest of the scoring RPCs — the endpoints a real match depends
      on every ball.
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
4. **Concurrent multi-scorer conflict handling** is specced but genuinely
   hard, and Phase 5 didn't touch it — `commitDelivery`'s only response to a
   conflict today is "resync and silently prefer the server," not the merge
   screen `docs/05` § 6 describes. That's explicitly Phase 6 scope, but
   flagging it here so it isn't mistaken for done.
5. **`exactOptionalPropertyTypes`** has needed a few explicit
   `...(x ? {y} : {})` spreads through Phase 5 (RPC payloads, `WicketInput`)
   rather than being pure friction — still seems worth keeping, but the
   pattern is worth knowing before you hit it fresh.
6. **None of Phases 1–5 have run against a real Supabase project** — every
   green checkmark in § 5.8 is against a local scratch Postgres. Phase 5 in
   particular ships the endpoints a live match calls every six seconds; "it
   passed pgTAP locally" and "it works against real hosted Postgres with
   real network latency and the real `auth` schema, under concurrent
   writers" are not the same claim. Push to `criclife-staging` and re-run
   before trusting this in front of real users.
7. **The accidental-tap guard and the 250–600ms "Recorded twice?" chip are
   unit-tested with fake timers, not felt on a real touchscreen.** The
   thresholds (250ms / 600ms) are the ones docs specify, but whether they
   feel right on an actual phone under actual thumb pressure hasn't been
   checked outside this sandbox.

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
│  │  ├─ matches/         ← Phase 4
│  │  ├─ scoring/         ← Phase 5 — store.ts, ScorerRoute.tsx, components/
│  │  ├─ home, settings, audience, ranks, admin, system
│  ├─ components/ui/      ← Button Card Skeleton CountUp Aurora LivePill
│  │                         ThemeToggle Crest Avatar
│  ├─ lib/                ← env supabase db(Dexie) theme haptics format cn sw
│  │                         wakeLock (Phase 5)
│  ├─ stores/             ← zustand uiStore
│  ├─ styles/             ← tokens.css globals.css animations.css
│  └─ types/database.ts   ← generated (see § 5.1 for how, since no Docker)
├─ supabase/
│  ├─ migrations/         ← Phases 2–5, 11 files, chronologically ordered
│  ├─ seed.sql            ← local-dev only, never runs against cloud
│  └─ tests/
│     ├─ run-local.sh     ← the local Postgres+pgTAP harness — see § 5.1
│     ├─ 00_local_auth_stub.sql  ← LOCAL ONLY, never push to real Supabase
│     └─ pgtap/           ← 11 files, 163 assertions
├─ tests/
│  ├─ engine/             ← Phase 1 — 100%-covered pure engine tests
│  ├─ features/           ← auth, matches, players, scoring (Phase 5) component tests
│  ├─ lib/, e2e/          ← unit + Playwright (no-scroll gate, viewport gate, smoke)
├─ public/                ← icons, manifest assets, fonts README
├─ scripts/               ← generate-icons.py
└─ .github/workflows/     ← ci.yml, keepalive.yml
```
