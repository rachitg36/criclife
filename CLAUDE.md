# CricLife

Mobile-first PWA for scoring cricket matches, with live audience view, player
stats and rankings. React 19 + Vite + Supabase. Runs entirely on free tiers.

**Current state: Phase 0 scaffolded but never installed or run.** Read
`HANDOFF.md` first — it explains exactly where things stand and what to do next.

## Commands

```bash
npm install            # never yet run — see HANDOFF.md
npm run dev            # :5173
npm run build          # tsc -b && vite build
npm run typecheck      # strict, no emit
npm run lint           # zero warnings allowed
npm run test           # vitest
npm run test:e2e       # playwright, incl. the no-scroll gate
npm run size           # bundle budget
npm run icons          # regenerate PWA icons (python3 + Pillow)
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
5. **Only the player owns their playing role.** Team admins can *suggest*, never
   set. Enforced in RLS, not just UI.
6. **Never auto-reload the service worker.** A scorer may be mid-over with an
   unsynced queue. `src/lib/sw.ts` prompts instead.
7. **No hardcoded colours.** Everything comes from `src/styles/tokens.css`.
   Both dark and light must work.
8. **Stay on free tiers.** Before adding a dependency or service, check
   `docs/14-FREE-TIER-PLAN.md`. Cloudflare Workers (Static Assets), not Vercel.

## Build order — do not skip ahead

Phases are in `docs/12-ROADMAP.md`, each with acceptance criteria.
**Phase 1 (the rules engine) comes before any feature UI.** It has no visible
output and it is tempting to skip. Don't. A wrong engine poisons every screen.

Current: Phase 0 → next: Phase 1.

## Layout

```
docs/          15 planning docs — README.md is the index
src/engine/    PURE rules engine (Phase 1, does not exist yet)
src/app/       router, providers, layouts, guards
src/features/  home · settings · scoring · audience · ranks · admin · system
src/components/ui/   Button Card Skeleton CountUp Aurora LivePill ThemeToggle
src/lib/       env supabase db(Dexie) theme haptics format cn sw
src/stores/    zustand — uiStore
src/styles/    tokens.css globals.css animations.css
tests/         unit (vitest) + e2e (playwright)
supabase/      migrations (Phase 2, does not exist yet)
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

| Question | Doc |
|---|---|
| How does a wide / free hit / run out score? | `docs/04-RULES-ENGINE.md` |
| Who can do what? The scoring token? | `docs/03-ROLES-PERMISSIONS.md` |
| Table and column definitions | `docs/02-DATA-MODEL.md` |
| Scorer screen layout budget | `docs/05-SCORER-VIEW.md` |
| Colours, motion, typography | `docs/08-DESIGN-SYSTEM.md` |
| Stat formulas, ranking maths | `docs/07-STATS-AND-RANKINGS.md` |
| Endpoints, RPCs, error codes | `docs/10-API-CONTRACT.md` |
| Every screen and route | `docs/11-SCREENS-AND-ROUTES.md` |
| What ships when | `docs/12-ROADMAP.md` |
| Free-tier limits, domains | `docs/14-FREE-TIER-PLAN.md` |

Docs are the spec. If code and docs disagree, say so rather than silently
picking one — the docs may need updating too.

## Things that need a human

I cannot do these; they need a browser and your accounts. `SETUP.md` has steps.

- ~~Deploy to Cloudflare~~ — done, live at `criclife.geminirachit.workers.dev`
  (Cloudflare Workers Static Assets, not Pages — see `docs/14-FREE-TIER-PLAN.md`)
- Open the is-a.dev PR for `criclife.is-a.dev`
- Create the two Supabase projects, disable phone auth
- Wire Resend as custom SMTP
- Add `SUPABASE_URL` / `SUPABASE_ANON_KEY` as GitHub secrets for the keepalive cron

## Style

Be direct. Flag disagreement rather than agreeing by default. When something in
the plan looks wrong once you're in the code, say so — the docs were written
before any of it ran.
