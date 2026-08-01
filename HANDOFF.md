# CricLife — Handoff

**Date:** 2026-08-01
**Written by:** Claude (Cowork session) → for a fresh Claude Code session
**State:** Planning complete. Phase 0 scaffolded. **Nothing has ever been
installed, compiled or run.**

Read this file, then `CLAUDE.md`, then start at § 6.

---

## 1. What this project is

A mobile-first PWA for scoring cricket matches. One person scores from a phone
on a screen that never scrolls; anyone can watch live on a public link; every
match is archived into player stats and rankings.

Constraints the owner set:

- Web app on mobile, **no app stores**
- Futuristic, dynamic, very visual, **dark + light mode**
- **Everything on free tiers**
- Overs per innings configurable
- Players set their own playing role
- Scoring rights are a transferable, revocable token multiple people can hold
- Ranks page: global by default, filterable by any set of teams
- **Minimum scrolling while scoring**

Decisions already locked in are logged in `docs/13-OPEN-QUESTIONS.md` § A and § E.

---

## 2. What exists

### Documentation — complete, 15 files in `docs/`

`docs/README.md` is the index. All 15 are written, cross-checked for
consistency, and internally linked. They are the spec.

The three that matter most: `04-RULES-ENGINE.md`, `03-ROLES-PERMISSIONS.md`,
`05-SCORER-VIEW.md`.

### Code — Phase 0 scaffold, 87 files

| Area | Status |
|---|---|
| Vite + React 19 + TS strict config | written |
| Tailwind v4 + full design token layer | written |
| Theme system: dark/light/auto, no-flash script, View Transition wipe | written |
| Zustand `uiStore` with persistence | written |
| Router with all 39 routes, guards stubbed, code split | written |
| UI primitives: Button Card Skeleton CountUp Aurora LivePill ThemeToggle | written |
| Layouts: Root, App (tab bar), Public, **Scoring (no-scroll shell)** | written |
| `lib/`: env, supabase, Dexie, theme, haptics, format, cn, sw | written |
| PWA manifest, generated icons, Workbox config | written |
| GitHub Actions: CI + **Supabase keepalive** | written |
| Vitest setup + 2 unit test files | written |
| Playwright config + no-scroll gate + smoke tests | written |

### Working screens (once it runs)

- `/` — home with aurora, count-up, quick links
- `/settings/appearance` — theme, accent picker, calm mode, all persisting
- `/matches/:matchId/score` — no-scroll shell reproducing the real layout budget
- `/live/:publicSlug` — public route, no auth
- Everything else is a `<Placeholder>` labelled with its phase and doc

---

## 3. ⚠️ What is NOT verified

**I had no npm registry access.** This is the single most important thing to
know. I could not run:

- `npm install`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test`

### What I *did* verify

- All 43 source files' internal imports resolve to real files
- All JSON and YAML parses (tsconfig files are JSONC — comments are valid)
- Braces and parens balance in every `.ts`/`.tsx`
- Route paths in `router.tsx` match `docs/11-SCREENS-AND-ROUTES.md`
- Generated icons render correctly (visually inspected)

### Expect to fix

Dependency versions in `package.json` are best-effort, not resolved against the
registry. Some are probably wrong. Likely trouble spots, in rough order:

1. **Version pins** — Tailwind v4 + `@tailwindcss/vite`, `motion` v12 import
   path (`motion/react`), React Router v7 API surface.
2. **`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`** are both on.
   These are strict and will surface errors I could not see. I pre-fixed the
   ones I could predict (see `Placeholder.tsx`, `theme.ts`, `format.ts`).
3. **`erasableSyntaxOnly`** requires TS 5.8+. Fine on ~5.9 but worth knowing.
4. **`virtual:pwa-register`** types come from `vite-plugin-pwa/client` in
   `tsconfig.app.json` types array — verify that resolves.
5. **Tailwind v4 `@theme inline`** syntax in `globals.css` — v4 is CSS-first
   config, no `tailwind.config.js`. Confirm the token bridge actually generates
   the utilities being used.

**Do not assume the scaffold is correct. Assume it is 90% correct.**

---

## 4. Missing on purpose

| Thing | Why |
|---|---|
| `src/engine/` | Phase 1. ESLint purity rules already written and waiting. |
| `supabase/migrations/` | Phase 2. Schema fully specced in `docs/02-DATA-MODEL.md`. |
| `src/types/database.ts` | Placeholder. Regenerate after migrations exist. |
| `public/fonts/*.woff2` | Not committed. See `public/fonts/README.md`. App falls back to system font. |
| `.env.local` | Copy `.env.example`. Placeholders work until Supabase exists. |
| Husky hooks | `prepare` script references husky but `.husky/` isn't initialised. Run `npx husky init` or drop the script. |

---

## 5. Human-only tasks still outstanding

Claude Code cannot do these — they need a browser and the owner's accounts.
Full steps in `SETUP.md`.

- [x] Deployed to Cloudflare Workers (Static Assets) — live at `criclife.geminirachit.workers.dev`
      (Cloudflare retired the old Pages dashboard flow; deployed via Wrangler CLI, see `wrangler.jsonc`)
- [ ] is-a.dev PR for **`criclife.is-a.dev`** (verified available 2026-08-01) → CNAME to `criclife.geminirachit.workers.dev`
- [ ] Supabase projects `criclife-prod` + `criclife-staging`; **disable phone auth**
- [ ] Resend account, wired as Supabase custom SMTP
- [x] Pushed to GitHub as a **public** repo — <https://github.com/rachitg36/criclife>
- [ ] Add `SUPABASE_URL` + `SUPABASE_ANON_KEY` repo secrets, run the keepalive workflow once

> The keepalive matters. Free Supabase projects pause after 7 idle days and need
> a manual dashboard click plus a 60s cold start to wake. For a league playing
> alternate weekends, that fails exactly when someone opens the app to score.

---

## 6. Start here in Claude Code

```
cd "D:\Claud\Cricket Normal"
claude
```

Then paste this:

> Read HANDOFF.md and CLAUDE.md. Then finish Phase 0: run npm install, fix any
> dependency version or TypeScript strict-mode errors in the scaffold, and get
> typecheck, lint, test and build all passing. Report what you had to change.

Or use the bundled command: `/verify-scaffold`

### After Phase 0 is green

> Start Phase 1: build the pure cricket rules engine in src/engine/ per
> docs/04-RULES-ENGINE.md, with the full test suite from § 12 of that doc.

Or: `/phase 1`

---

## 7. Decisions worth not re-litigating

Reasoning is in `docs/13-OPEN-QUESTIONS.md` § A. Short version:

| Decision | Because |
|---|---|
| PWA, not React Native | No app stores wanted; one codebase serves phone, laptop and the TV at the ground |
| Supabase over Firebase | The scoring token is a row-level auth problem — that's what Postgres RLS is for. Rankings are aggregate SQL. |
| Cloudflare (Workers Static Assets) over Vercel | Vercel Hobby is non-commercial and caps at 100 GB, then **pauses your site**. Terrible failure mode for live scores. Note: Cloudflare's product was "Pages" when this was written; it's since merged into Workers — see `docs/14-FREE-TIER-PLAN.md`. |
| Rules engine before UI | Only part where a mistake is expensive to undo, and it needs no design decisions |
| Undo by replay, not reversal | Reversal logic is where scoring apps get subtly wrong. 130 rows replays in ~15ms. |
| Append-only delivery log | Disputed scores are the #1 social problem in amateur cricket |
| "Scoring map" = a rights topology graph | Best reading of the request; the wagon wheel is separately planned as Advanced Mode |
| Team admins can only *suggest* roles | Owner said players own their roles |
| Exponential decay ranking, 20-match half-life | Recent form should matter; one lucky innings shouldn't top the board |

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
3. **The 596px scorer layout budget** was computed on paper. It fits 375×667
   arithmetically. It has never been rendered on a real phone.
4. **Concurrent multi-scorer conflict handling** is specced but genuinely hard.
   The merge screen in `docs/05` § 6 is the least-tested idea in the plan.
5. **`exactOptionalPropertyTypes`** may prove more friction than it's worth. If
   it's fighting you constantly in Phase 1, turning it off is defensible.

---

## 9. File map

```
Cricket Normal/
├─ CLAUDE.md              ← project memory, auto-loaded by Claude Code
├─ HANDOFF.md             ← this file
├─ README.md              ← public-facing overview
├─ SETUP.md               ← the human account steps
├─ .claude/
│  ├─ settings.json       ← permission allowlist
│  └─ commands/           ← /verify-scaffold, /phase, /check
├─ docs/                  ← 15 planning docs, README.md is the index
├─ src/                   ← Phase 0 scaffold
├─ tests/                 ← unit + e2e
├─ public/                ← icons, manifest assets, fonts README
├─ scripts/               ← generate-icons.py
└─ .github/workflows/     ← ci.yml, keepalive.yml
```
