# CricLife — Handoff

**Date:** 2026-08-02
**State:** **Phases 0–4 complete and pushed** to `claude/session-context-ifpggh`.
Phase 5 (the scorer view) has **not** started.

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

### Next: Phase 5 — the scorer view

> Start Phase 5: build `ScoringLayout` and the actual scoring pad per
> `docs/05-SCORER-VIEW.md` — score block, batters row, bowler row,
> over-dot strip, run pad 0–6 + `7+`, modifier row, action row, all inside
> the existing no-scroll shell.

Or: `/phase` (the skill re-reads the roadmap and confirms Phase 4's
acceptance criteria still pass before building).

Before writing code: **re-verify Phase 4's foundation is still green.**
Container restarts kill the local Postgres server (this sandbox has no
Docker — see § 5.1). Bring it back and re-run the pgTAP suite:

```bash
sudo service postgresql start   # or: sudo pg_ctlcluster <ver> <cluster> start
bash supabase/tests/run-local.sh --seed --pgtap   # expect 111/111 "ok"
npm run typecheck && npm run lint && npm run test   # expect 224/224
```

### Why Phase 5 matters more than it looks

`record_delivery` (docs/10 § 3.1) is the single most important endpoint in
the app, and Phase 5 is where the scorer pad that calls it gets built. It's
also the phase that finally lets us verify the half of **Phase 4's E2E flow
4** that couldn't be tested yet: "Scorer A passes the token to Scorer B, A's
pad locks and B's unlocks." The grants/realtime side of that is done
(Phase 4); the pad-locking side needs the pad to exist.

Two things Phase 5 will need that don't exist yet:

- **`start_innings`** (built in Phase 4) creates the `innings` row but does
  **not** persist openers/opening bowler anywhere — there's no column for
  it pre-first-ball. The scorer pad's own "who's on strike, who's bowling"
  initialization is what actually sets those, as the first `deliveries` row.
- **`record_delivery`** itself doesn't exist as a Postgres RPC yet — only
  the pure TS engine (`src/engine/applyDelivery.ts`) does. Per docs/10 § 3.1,
  the server needs its own re-validation of the ball (ported to PL/pgSQL for
  the critical subset: legality, seq, grants, limits) — "the client engine
  is for speed; the server is for truth." That porting is Phase 5/6 work,
  not done yet.

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

(`npm run test:e2e` needs Playwright browsers, and this sandbox only has
Chromium — see § 5.1's e2e note before assuming `npx playwright install
--with-deps` will get you WebKit/Firefox too.)

To redeploy after any change: `npm run deploy` (builds, then `wrangler
deploy`). First time on a new machine, run `npx wrangler login` first
(browser-based auth, opens dash.cloudflare.com). **Deploys are still manual**
— no CD wiring yet (see § 7).

---

## 4. Live infrastructure reference

| Thing                                                             | Value                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployed app (Phase 0 build only — Phases 1–4 not yet redeployed) | `https://criclife.geminirachit.workers.dev`                                                                                                                                                                 |
| GitHub repo                                                       | `https://github.com/rachitg36/criclife` (public)                                                                                                                                                            |
| Working branch                                                    | `claude/session-context-ifpggh` — all of Phases 1–4 are here, not on `main`                                                                                                                                 |
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
§ 5.1.

---

## 5. What exists in code

### 5.1 Sandbox limitations that shaped how this got built

Every session so far has hit the same three walls, and worked around them the
same way each time — worth knowing before you re-discover them:

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
2. **`supabase gen types typescript` needs Docker too.** Worked around with a
   custom introspection script: a big `pg_class`/`pg_attribute`/`pg_proc`
   query (`/tmp/.../scratchpad/introspect.sql`, regenerated each session
   since `/tmp` doesn't persist) piped into a hand-written generator
   (`/tmp/.../scratchpad/gen-database-types.mjs`) that produces
   `src/types/database.ts` in the same shape `supabase gen types` would.
   The generator has needed two rounds of bug fixes across Phases 2–4
   (optional/nullable RPC args via `pronargdefaults`; array-typed args and
   `SETOF`-returning functions) — re-check its output against `\d` on any
   function whose signature looks off before trusting it blindly.
3. **Playwright only has Chromium installed** (`/opt/pw-browsers/chromium-1194`).
   The `desktop` project in `playwright.config.ts` works as-is; the four
   mobile projects (`iphone-se`, `small-375`, `iphone-14`,
   `iphone-14-pro-max`) all default to WebKit and cannot run here. When you
   need to run e2e, temporarily add
   `use: { launchOptions: { executablePath:
'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } }` to the config,
   run `--project=desktop`, then **revert the config change** — don't leave
   it committed, since a real CI runner has all browsers.

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
`vitest.config.ts` threshold gate on `src/engine/**`. 203 tests: the full
§ 5.2 legality table, fast-check property tests for run/ball/wicket
conservation and replay determinism, three full-match fixtures cross-verified
two ways.

### 5.4 Phase 2 — data layer & auth

- `supabase/migrations/` — 8 files (extensions/enums → identity/teams →
  matches/grants → deliveries log → stats/audit → functions/triggers → RLS
  policies → `claim_player` RPC). Every table has RLS enabled, deny-by-default.
- `supabase/seed.sql` — 4 teams, 44 shadow players, 1 Super Admin. Local-dev
  only by Supabase CLI convention; never runs against a linked cloud project.
- `src/lib/supabase.ts`, `src/app/providers/queryClient.ts` — typed client +
  TanStack Query, tuned for flaky connectivity at a cricket ground.
- `src/features/auth/` — `AuthProvider`, `authContext.ts`, `useProfile.ts`,
  `LoginPage` (magic link + Google), `AuthCallbackPage`, `OnboardingPage`
  (name → role → team-skip, plus `claimCode` deep-link handling).
- `src/app/guards/RequireAuth.tsx`, `RequireSuperAdmin.tsx` — real, not stubs.
- Router: `AuthedOutlet` (lazy) scopes `AuthProvider` — and the
  `@supabase/supabase-js` it drags in — to only the branches that need a
  session, so the audience bundle stays auth-free.

### 5.5 Phase 3 — teams, players & self-managed roles

- Migration adds `create_team`, `create_shadow_player`, `search_profiles`,
  `add_existing_profile_to_team`, `suggest_role_change`,
  `respond_to_role_suggestion`, `transfer_team_ownership`, `archive_team`.
- Screens: `/teams`, `/teams/new`, `/teams/:teamId` (+ `/squad`),
  `/teams/:teamId/add-player`, `/teams/:teamId/settings`,
  `/players/:playerId`, `/players/:playerId/edit` (the screen the whole
  phase exists for — self-service role management), `/players/claim`.
- Router grows a **second public branch**: `PublicAuthedOutlet` (lazy) —
  team/player pages are public-read but need to know the viewer's session
  (does a manager see "+ Add player"?) without pulling `supabase-js` into
  the strict anonymous audience bundle (`/live/:publicSlug`, `/ranks`),
  which stays on plain `PublicLayout`.
- Component tests cover E2E flows 2 & 3 (player edits own role and it
  persists; a team admin is blocked from another player's role and offered
  "suggest" instead).

### 5.6 Phase 4 — match setup & the scoring token

- Migration adds `create_match`, `set_toss`, `set_playing_xi`,
  `start_innings` (creates the innings row + flips the match live; does
  **not** persist openers — see § 2), `issue_scoring_grant`,
  `revoke_scoring_grant`, `transfer_scoring_grant`, `create_handoff_token`,
  `redeem_handoff_token`, `get_match_grants`.
- New table not in `docs/02`: `handoff_tokens` (RLS enabled, **zero**
  policies — only the two handoff RPCs ever touch it).
- Screens: `/matches/new` (4-step wizard reusing the engine's own rules
  profiles), `/matches/:matchId` (hub, on the `PublicAuthedOutlet` branch —
  public-read but auth-aware), `/matches/:matchId/setup` (toss + XI +
  captain/keeper), `/matches/:matchId/rights` (Scoring Rights Map — list
  view + a simplified radial SVG graph, Supabase Realtime subscription so a
  revocation is visible instantly), `/redeem-grant/:token` (the QR handoff
  target — see § 6.4).

### 5.7 Current verification numbers (all re-confirmed at end of Phase 4)

| Check                                                   | Result                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| pgTAP                                                   | **111/111** across 10 files in `supabase/tests/pgtap/`                                                                    |
| Unit/component tests (`npm run test`)                   | **224/224** across 20 files                                                                                               |
| `npm run typecheck` / `npm run lint`                    | clean                                                                                                                     |
| `npm run build` + `npm run size`                        | audience route **162.8 kB** brotli, budget 180 kB                                                                         |
| e2e (`npm run test:e2e`, desktop/Chromium project only) | **10 passed, 3 intentionally skipped** (theme-toggle tests need a real signed-in session — see `tests/e2e/smoke.spec.ts`) |

---

## 6. Missing on purpose / deferred, with why

### 6.1 Whole features, by phase

| Thing                                                                        | Why                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ScoringLayout` real content (run pad, score block, etc.)                    | Phase 5 — layout shell exists (Phase 0), no-scroll gate passes, but it's empty |
| `record_delivery` and the rest of the match-log RPCs                         | Phase 5/6 — only the pure TS engine exists so far                              |
| `/matches` (list: Live · Upcoming · Completed)                               | Not an explicit Phase 4 roadmap bullet; still a `<Placeholder>`                |
| `/matches/:matchId/settings`, `/matches/:matchId/review`                     | Phase 4/6 respectively per roadmap; stubs                                      |
| `/teams/:teamId/matches`, `/teams/:teamId/stats`, `/ranks/compare`, `/stats` | Phase 8 (stats/rankings) — stubs                                               |
| Most of `/settings/*` (only `/settings/appearance` is real)                  | Phase 9                                                                        |
| `/admin/*`                                                                   | Phase 9                                                                        |
| Rank/form columns on squad rows                                              | Render `–` — no stats pipeline exists until Phase 7/8                          |
| Real file upload for team logos / player photos                              | URL fields only; no storage wiring yet                                         |

### 6.2 Simplifications inside phases that did ship

- **Batting order reordering** in the XI setup screen (Phase 4) is
  up/down-style selection, not full drag-and-drop.
- **The Scoring Rights Map's graph view** is a real but intentionally simple
  radial SVG layout, not the full force-directed physics + canvas particle
  spec in `docs/03` § 3.4. The list view (also required, and the a11y
  fallback) is fully functional.
- **Handoff QR redeems via URL, not an in-app camera scanner.** The QR
  encodes `/redeem-grant/:token`; any phone's stock camera app already
  handles that, which is both simpler and more robust than reimplementing
  barcode scanning — and camera-based scanning isn't verifiable in a
  headless sandbox regardless.
- **"Invite an existing user"** (Phase 3, `/teams/:teamId/add-player`)
  matches by _exact_ handle or email via `search_profiles`, not fuzzy
  matching — kept narrow deliberately since `profiles` is otherwise locked
  down (see § 6.4).

### 6.3 Human-only tasks — status (unchanged since Phase 0 unless noted)

- [x] Deploy to Cloudflare Workers — live at `criclife.geminirachit.workers.dev`
      (**still the Phase 0 build** — Phases 1–4 haven't been redeployed; see § 4)
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
      either real project yet (see § 4)
- [ ] (Optional, deferred) Google OAuth client — code is ready, needs a
      Google Cloud project + credentials
- [ ] (Follow-up) Merge of is-a.dev PR, then add the custom domain to the Worker
- [ ] (Follow-up) CD workflow so pushes to `main` redeploy — currently manual
- [ ] Verify Add-to-Home-Screen on a real phone — never tested on a device

> The keepalive matters. Free Supabase projects pause after 7 idle days and need
> a manual dashboard click plus a 60s cold start to wake.

### 6.4 Gaps in the docs found and closed while building (so nobody re-discovers them as bugs)

Each of these is a place where `docs/02`/`docs/03`/`docs/10` described a
capability but the schema or RLS as literally specified couldn't actually
support it. All are called out with a comment at the top of the relevant
migration file too.

| Gap                                                                                                                             | Where it lives | Fix                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| Shadow player claiming: no policy can move `profile_id` from null to a real user                                                | Phase 2        | `claim_player` RPC (security definer)                                                                       |
| Creating a team is chicken-and-egg: the owner can't become a `team_members` row until a manager row already exists on that team | Phase 3        | `create_team` RPC does both atomically                                                                      |
| "Invite an existing user" needs to search `profiles`, which is locked to self-or-Super-Admin                                    | Phase 3        | `search_profiles` RPC — narrow, authenticated-only, returns only id/display_name/handle/avatar              |
| "Archive team" is owner-only per the docs/03 § 4 matrix, stricter than the general `teams_update` policy (owner-or-admin)       | Phase 3        | `archive_team` / `transfer_team_ownership` RPCs enforce the tighter rule directly                           |
| Handoff QR (docs/03 § 3.5) has no backing table in docs/02                                                                      | Phase 4        | New `handoff_tokens` table, RLS enabled with zero policies                                                  |
| Scoring Rights Map needs grant holders' names, but `profiles` is locked down                                                    | Phase 4        | `get_match_grants` RPC — mirrors `grants_read`'s own authorization, returns display fields                  |
| `start_innings` (docs/10 § 3.6) implies persisting openers, but `innings` (docs/02 § 6) has no column for it pre-first-ball     | Phase 4        | RPC only creates the innings row + flips the match live; openers are Phase 5's job (first `deliveries` row) |

---

## 7. Decisions worth not re-litigating

Reasoning is in `docs/13-OPEN-QUESTIONS.md` § A. Short version:

| Decision                                              | Because                                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| PWA, not React Native                                 | No app stores wanted; one codebase serves phone, laptop and the TV at the ground                                     |
| Supabase over Firebase                                | The scoring token is a row-level auth problem — that's what Postgres RLS is for. Rankings are aggregate SQL.         |
| Cloudflare (Workers Static Assets) over Vercel        | Vercel Hobby is non-commercial and caps at 100 GB, then **pauses your site**. Terrible failure mode for live scores. |
| Rules engine before UI                                | Only part where a mistake is expensive to undo, and it needs no design decisions                                     |
| Undo by replay, not reversal                          | Reversal logic is where scoring apps get subtly wrong. 130 rows replays in ~15ms.                                    |
| Append-only delivery log                              | Disputed scores are the #1 social problem in amateur cricket                                                         |
| "Scoring map" = a rights topology graph               | Best reading of the request; the wagon wheel is separately planned as Advanced Mode                                  |
| Team admins can only _suggest_ roles                  | Owner said players own their roles                                                                                   |
| Exponential decay ranking, 20-match half-life         | Recent form should matter; one lucky innings shouldn't top the board                                                 |
| Local Postgres + pgTAP instead of `supabase start`    | This sandbox has no Docker; see § 5.1. Deliberate, disclosed deviation — not silently swapped for a mock.            |
| Handoff QR encodes a URL, not a custom in-app scanner | Any phone camera already handles it; see § 6.2.                                                                      |

Still open, none blocking: who can create teams (B2) — resolved in practice
as "anyone" via `create_team`, but not formally re-decided; tournaments in v1
(B4), a team ladder as well as player ranks (B6), web push in v1 (B8),
importing historic matches (B9).

---

## 8. Things I'd want a second opinion on

Genuine uncertainty, not false modesty:

1. **The rating formula constants** in `docs/07` § 2 are invented. They're
   plausible but untuned. They need a season of real data.
2. **The win-probability heuristic** is a placeholder shipped with an "estimate"
   label. Fine, but don't let it look authoritative.
3. **The 596px scorer layout budget** was computed on paper. It fits 375×667
   arithmetically. It has never been rendered on a real phone.
4. **Concurrent multi-scorer conflict handling** is specced but genuinely hard.
   The merge screen in `docs/05` § 6 is the least-tested idea in the plan.
5. **`exactOptionalPropertyTypes`** may prove more friction than it's worth. If
   it's fighting you constantly, turning it off is defensible. (It hasn't
   caused problems through Phase 4.)
6. **None of Phases 1–4 have run against a real Supabase project** — every
   green checkmark in § 5.7 is against a local scratch Postgres. The RLS
   design is sound in principle, but "it passed pgTAP locally" and "it works
   against the real hosted Postgres with real network latency and the real
   `auth` schema" are not the same claim. Push to `criclife-staging` and
   re-run before trusting this in front of real users.

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
│  │  ├─ home, settings, scoring, audience, ranks, admin, system
│  ├─ components/ui/      ← Button Card Skeleton CountUp Aurora LivePill
│  │                         ThemeToggle Crest Avatar (Crest/Avatar: Phase 3)
│  ├─ lib/                ← env supabase db(Dexie) theme haptics format cn sw
│  ├─ stores/             ← zustand uiStore
│  ├─ styles/             ← tokens.css globals.css animations.css
│  └─ types/database.ts   ← generated (see § 5.1.2 for how, since no Docker)
├─ supabase/
│  ├─ migrations/         ← Phases 2–4, 10 files, chronologically ordered
│  ├─ seed.sql            ← local-dev only, never runs against cloud
│  └─ tests/
│     ├─ run-local.sh     ← the local Postgres+pgTAP harness — see § 5.1
│     ├─ 00_local_auth_stub.sql  ← LOCAL ONLY, never push to real Supabase
│     └─ pgtap/           ← 10 files, 111 assertions
├─ tests/                 ← unit (vitest) + component + e2e (playwright)
├─ public/                ← icons, manifest assets, fonts README
├─ scripts/               ← generate-icons.py
└─ .github/workflows/     ← ci.yml, keepalive.yml
```
