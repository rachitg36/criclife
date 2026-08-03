# CricLife

Mobile-first PWA for scoring cricket matches, with live audience view, player
stats and rankings. React 19 + Vite + Supabase. Runs entirely on free tiers.

**Current state: Phases 0–7 complete** — engine, data layer, teams/players,
match setup, the scorer pad, offline sync, and the public audience view. Next
is Phase 8 (stats & rankings). The Phase 7 build is deployed, but **no
migration has ever run against a real Supabase project**, so every screen that
reads data fails in production. Read `HANDOFF.md` for the full picture —
including how to bring a fresh container back up (not just `npm install`) and
what `.env.production.local` is for before you redeploy.

## Commands

```bash
npm install
npm run dev            # :5173
npm run build          # tsc -b && vite build
npm run typecheck      # strict, no emit
npm run lint           # zero warnings allowed
npm run test           # vitest
npm run test:e2e       # playwright, incl. the no-scroll gate
npm run size           # bundle budget
npm run icons          # regenerate PWA icons (python3 + Pillow)
npm run deploy         # vite build && wrangler deploy — manual, no CD yet
```

## Non-negotiable rules

1. **`src/engine/` is pure.** No React, no network, no DOM, no `Date.now()`, no
   `Math.random()`. Time is passed in as a parameter. ESLint enforces this. Every
   score in the app is a projection of the `deliveries` log through this engine.
2. **The scorer view never scrolls.** `src/app/layouts/ScoringLayout.tsx` is
   `100dvh; overflow:hidden`. If content doesn't fit, fix the layout, not the
   budget. `tests/e2e/scorer-no-scroll.spec.ts` gates this at four viewports.
3. **`deliveries` is append-only.** Undo = soft delete + audit row + replay the
   innings from ball 1. Never write reverse-a-delivery logic.
4. **Scoring writes to IndexedDB first, network second.** The pad must never
   await a request. A whole match has to be scorable offline.
5. **Only the player owns their playing role.** Team admins can _suggest_, never
   set. Enforced in RLS, not just UI.
6. **Never auto-reload the service worker.** A scorer may be mid-over with an
   unsynced queue. `src/lib/sw.ts` prompts instead.
7. **No hardcoded colours.** Everything comes from `src/styles/tokens.css`.
   Both dark and light must work.
8. **Stay on free tiers.** Before adding a dependency or service, check
   `docs/14-FREE-TIER-PLAN.md`. Cloudflare Workers (Static Assets), not Vercel.
9. **The audience route's initial JS is budgeted at 180 kB** and currently sits
   at 174.69 kB. `/live/:publicSlug` must not statically import
   `@supabase/supabase-js` — it reads its snapshot over plain `fetch`
   (`src/lib/publicApi.ts`) and imports the client dynamically for Realtime
   only. `npm run size` is the gate. See HANDOFF.md § 2.

## Build order — do not skip ahead

Phases are in `docs/12-ROADMAP.md`, each with acceptance criteria.
**Phase 1 (the rules engine) comes before any feature UI.** It has no visible
output and it is tempting to skip. Don't. A wrong engine poisons every screen.

Current: Phases 0–7 done → next: Phase 8 (stats & rankings).

## Layout

```
docs/          15 planning docs — README.md is the index
src/engine/    PURE rules engine — 100% covered, the source of every score
src/app/       router, providers, layouts, guards
src/features/  home · settings · scoring · audience · ranks · admin · system
src/components/ui/   Button Card Skeleton CountUp Aurora LivePill ThemeToggle
src/components/viz/  hand-rolled SVG charts (worm, manhattan, run rate, …)
src/lib/       env supabase db(Dexie) theme haptics format cn sw
src/stores/    zustand — uiStore
src/styles/    tokens.css globals.css animations.css
tests/         unit (vitest) + e2e (playwright)
supabase/      migrations + seed + a local Postgres/pgTAP harness (no Docker)
```

## Conventions

- DB: `snake_case`, plural tables. TS: `PascalCase` types, `camelCase` vars.
  Routes: `kebab-case`, params `:matchId` `:teamId` `:playerId` `:publicSlug`.
- Import alias `@/` → `src/`.
- A **delivery** is one ball, legal or not. A **legal delivery** counts toward
  the over. **Innings** is both singular and plural; the table is `innings`.
- Numerals in UI always `tabular-nums` — a jittering score is unusable.
- Nullable stats render as `–`, never `NaN` or `0.00`.

## Where to look things up

| Question                                    | Doc                             |
| ------------------------------------------- | ------------------------------- |
| How does a wide / free hit / run out score? | `docs/04-RULES-ENGINE.md`       |
| Who can do what? The scoring token?         | `docs/03-ROLES-PERMISSIONS.md`  |
| Table and column definitions                | `docs/02-DATA-MODEL.md`         |
| Scorer screen layout budget                 | `docs/05-SCORER-VIEW.md`        |
| Colours, motion, typography                 | `docs/08-DESIGN-SYSTEM.md`      |
| Stat formulas, ranking maths                | `docs/07-STATS-AND-RANKINGS.md` |
| Endpoints, RPCs, error codes                | `docs/10-API-CONTRACT.md`       |
| Every screen and route                      | `docs/11-SCREENS-AND-ROUTES.md` |
| What ships when                             | `docs/12-ROADMAP.md`            |
| Free-tier limits, domains                   | `docs/14-FREE-TIER-PLAN.md`     |

Docs are the spec. If code and docs disagree, say so rather than silently
picking one — the docs may need updating too.

## Things that need a human

I cannot do these; they need a browser and your accounts. `SETUP.md` has steps.

All of Phase 0's human-only setup is **done** (deploy, GitHub repo, Supabase
projects, phone auth off, Resend SMTP, Actions secrets, keepalive). What's
left — the first one now blocks real use:

- **Sign-in is broken on staging** — `POST /auth/v1/otp` returns 500 and
  nothing reaches Resend. Almost certainly SMTP. This blocks everything;
  HANDOFF.md § 2 opens with the diagnosis and the fastest way past it.
- **Run the migrations against `criclife-prod`.** `criclife-staging` was done
  on 2026-08-03 and verified; prod is still empty, and prod is what the
  deployed app points at. See HANDOFF.md § 4.
- Measure Phase 7's own bar: audience latency under 1.5s p95 on 4G, and
  Lighthouse mobile ≥ 90 on `/live/:publicSlug`. Neither is measurable here.

- Merge of the is-a.dev PR ([#45746](https://github.com/is-a-dev/register/pull/45746)),
  then add `criclife.is-a.dev` as a custom domain on the Worker — keep the
  `.workers.dev` domain too, or installed PWAs break
- ~~Verify Add-to-Home-Screen on a real phone~~ — done 2026-08-03
- Google OAuth client — deferred to Phase 2, when there's a login UI

## Style

Be direct. Flag disagreement rather than agreeing by default. When something in
the plan looks wrong once you're in the code, say so — the docs were written
before any of it ran.
