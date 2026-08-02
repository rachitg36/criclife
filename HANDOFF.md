# CricLife — Handoff

**Date:** 2026-08-01
**Written by:** Claude Code (laptop session) → for continuation on another
device/session (e.g. mobile cloud co-work)
**State:** Phase 0 done, verified, and deployed. Deployment + domain setup is
most of the way through. Phase 1 (the rules engine) has **not** started.

Read this file, then `CLAUDE.md`. Skip straight to **§ 2** for what to do next
— § 1 and § 8 are background/history if you want it.

---

## 1. What this project is

A mobile-first PWA for scoring cricket matches. One person scores from a phone
on a screen that never scrolls; anyone can watch live on a public link; every
match is archived into player stats and rankings. Runs entirely on free tiers.

Decisions already locked in are logged in `docs/13-OPEN-QUESTIONS.md` § A and § E.

---

## 2. Continue here — exact next step

We're mid-way through the Phase 0 deployment/account-setup checklist,
working through it live in chat, one browser step at a time. **Pick up at
GitHub secrets + keepalive.**

Resend is done — custom SMTP wired on both `criclife-prod` and
`criclife-staging` (Authentication → Emails → SMTP Settings in the Supabase
dashboard, host `smtp.resend.com`, sender `onboarding@resend.dev` until a
real domain is verified).

### Immediately next: GitHub secrets + keepalive

1. On GitHub → `rachitg36/criclife` → **Settings → Secrets and variables →
   Actions**, add:
   | Secret | Value |
   |---|---|
   | `SUPABASE_URL` | `https://tljbwnbjwgdpmdhvttai.supabase.co` |
   | `SUPABASE_ANON_KEY` | the `criclife-prod` publishable key (see § 4 below) |
2. Run it once manually to confirm: **Actions → Supabase keepalive → Run
   workflow**. (The workflow file already exists at
   `.github/workflows/keepalive.yml` — nothing to write, just needs the
   secrets and a manual trigger.)

### After that: Phase 0 is fully done. Start Phase 1.

> Start Phase 1: build the pure cricket rules engine in `src/engine/` per
> `docs/04-RULES-ENGINE.md`, with the full test suite from § 12 of that doc.
> First confirm Phase 0's acceptance criteria in `docs/12-ROADMAP.md` — they
> should all be checked off by this point.

Or: `/phase 1` — but note the last time this was tried (before deployment was
finished), the answer was "stop and do deployment setup first," which is the
work this file documents. This time it should be a clean go-ahead.

---

## 3. If starting from a fresh clone (e.g. a new cloud environment)

```bash
git clone https://github.com/rachitg36/criclife.git
cd criclife
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

(`npm run test:e2e` needs Playwright browsers: `npx playwright install --with-deps`.)

To redeploy after any change: `npm run deploy` (builds, then `wrangler
deploy`). First time on a new machine, run `npx wrangler login` first
(browser-based auth, opens dash.cloudflare.com).

---

## 4. Live infrastructure reference

| Thing | Value |
|---|---|
| Deployed app | `https://criclife.geminirachit.workers.dev` |
| GitHub repo | `https://github.com/rachitg36/criclife` (public) |
| is-a.dev PR | [is-a-dev/register#45746](https://github.com/is-a-dev/register/pull/45746) — pending merge |
| Supabase `criclife-prod` | Project ID `tljbwnbjwgdpmdhvttai`, region `eu-central-1` (Frankfurt — kept as-is despite docs recommending Mumbai/Singapore) |
| Supabase `criclife-prod` publishable key | `sb_publishable_oyHY2XoW3H2sk3ckL8JyQA_FLYJD6OM` |
| Supabase `criclife-staging` | Project ID `mkzgwwqkwcjcggxuavlr` |
| Supabase `criclife-staging` publishable key | `sb_publishable_AOlNgi5MClWG1zHMbtofaA_v-Zb0XsE` |
| Phone auth | Disabled on both Supabase projects (confirmed) |
| Google OAuth | **Deferred to Phase 2** — no login UI exists yet to wire it into |

These are publishable/anon-tier credentials, safe to keep in plain text here
and in `.env.local`. **Never** put a Supabase personal access token, service
role key, or Resend API key in this file or in chat — those go directly into
the relevant dashboard, never through an assistant.

---

## 5. What exists in code

### Documentation — complete, 15 files in `docs/`

`docs/README.md` is the index. The three that matter most:
`04-RULES-ENGINE.md`, `03-ROLES-PERMISSIONS.md`, `05-SCORER-VIEW.md`.

### Code — Phase 0, verified and deployed

Everything below is confirmed working (not just written) via
`npm run typecheck/lint/test/build/size` and `npm run test:e2e` (45 tests,
4 viewports + desktop, including the no-scroll gate) — all green.

| Area | Status |
|---|---|
| Vite + React 19 + TS strict config | verified |
| Tailwind v4 + full design token layer | verified |
| Theme system: dark/light/auto, no-flash script, View Transition wipe | verified |
| Zustand `uiStore` with persistence | verified |
| Router with all 39 routes, guards stubbed, code split | verified |
| UI primitives: Button Card Skeleton CountUp Aurora LivePill ThemeToggle | verified |
| Layouts: Root, App (tab bar), Public, **Scoring (no-scroll shell)** | verified |
| `lib/`: env, supabase, Dexie, theme, haptics, format, cn, sw | verified |
| PWA manifest, generated icons, Workbox config, service worker registered | verified |
| GitHub Actions: CI + **Supabase keepalive** | written, keepalive not yet run |
| Vitest setup + unit tests | verified (23 passing) |
| Playwright e2e + no-scroll gate + smoke tests | verified (45 passing) |
| Cloudflare Workers deploy (`wrangler.jsonc`) | verified, live |

### Fixes made to get Phase 0 green (see git log for details)

- `tsconfig.app.json`/`tsconfig.node.json`: added `skipLibCheck: true`
  (Playwright/Workbox type declarations assumed DOM lib that `tsconfig.node`
  didn't have)
- `src/lib/theme.ts`: `prefer-const` lint fix
- `src/app/providers/`: split `queryClient` into its own file (fast-refresh
  lint rule)
- `.env.local` didn't exist — `src/lib/env.ts` throws at module load without
  it, blanking the entire app silently. Created it; also lengthened the
  placeholder anon key in `.env.example` since the original was too short to
  pass its own Zod validation.
- `npm run size` budget was measuring the wrong thing (globbed every route's
  JS, not just the audience route's). Fixed the `size-limit` config, and
  found `dexie` was leaking into the eager `vendor-data` chunk via
  `vite.config.ts`'s `manualChunks` — removed it, made `OfflinePage` lazy.
  Audience route now 158 kB brotli vs. 180 kB budget.
- Cloudflare retired the "Pages" dashboard flow (git-integration + Framework
  preset UI) in favor of unified Workers. Added `wrangler.jsonc`, deployed
  via CLI instead. Subdomain shape changed from `<project>.pages.dev` to
  `<worker>.<account>.workers.dev` — all docs updated to match.

### Working screens (once it runs)

- `/` — home with aurora, count-up, quick links
- `/settings/appearance` — theme, accent picker, calm mode, all persisting
- `/matches/:matchId/score` — no-scroll shell reproducing the real layout budget
- `/live/:publicSlug` — public route, no auth
- Everything else is a `<Placeholder>` labelled with its phase and doc

---

## 6. Missing on purpose

| Thing | Why |
|---|---|
| `src/engine/` | Phase 1 — not started. ESLint purity rules already written and waiting. |
| `supabase/migrations/` | Phase 2. Schema fully specced in `docs/02-DATA-MODEL.md`. Both cloud projects exist but are empty. |
| `src/types/database.ts` | Placeholder. Regenerate after migrations exist. |
| `public/fonts/*.woff2` | Not committed. See `public/fonts/README.md`. App falls back to system font. |
| Husky hooks | `prepare` script references husky but `.husky/` isn't initialised. Run `npx husky init` or drop the script. |
| Google OAuth | Deferred to Phase 2 — needs a Google Cloud OAuth client, and there's no login UI yet to use it. |

---

## 7. Human-only tasks — status

- [x] Deploy to Cloudflare Workers — live at `criclife.geminirachit.workers.dev`
- [x] Push to GitHub as a public repo
- [x] Open the is-a.dev PR — pending merge
- [x] Create both Supabase projects
- [x] Disable phone auth on both
- [x] Resend account, wired as custom SMTP on both `criclife-prod` and `criclife-staging`
- [ ] **← Add `SUPABASE_URL` / `SUPABASE_ANON_KEY` as GitHub Actions secrets**
- [ ] Run the keepalive workflow once manually
- [ ] (Optional, deferred) Google OAuth client

> The keepalive matters. Free Supabase projects pause after 7 idle days and need
> a manual dashboard click plus a 60s cold start to wake. For a league playing
> alternate weekends, that fails exactly when someone opens the app to score.

---

## 8. Decisions worth not re-litigating

Reasoning is in `docs/13-OPEN-QUESTIONS.md` § A. Short version:

| Decision | Because |
|---|---|
| PWA, not React Native | No app stores wanted; one codebase serves phone, laptop and the TV at the ground |
| Supabase over Firebase | The scoring token is a row-level auth problem — that's what Postgres RLS is for. Rankings are aggregate SQL. |
| Cloudflare (Workers Static Assets) over Vercel | Vercel Hobby is non-commercial and caps at 100 GB, then **pauses your site**. Terrible failure mode for live scores. Note: Cloudflare's product was "Pages" when this was originally written; it's since merged into Workers — see `docs/14-FREE-TIER-PLAN.md`. |
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

## 9. Things I'd want a second opinion on

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

## 10. File map

```
Cricket Normal/
├─ CLAUDE.md              ← project memory, auto-loaded by Claude Code
├─ HANDOFF.md             ← this file
├─ README.md              ← public-facing overview
├─ SETUP.md               ← the human account steps (detailed version of § 2 above)
├─ wrangler.jsonc         ← Cloudflare Workers static-assets deploy config
├─ .claude/
│  ├─ launch.json         ← preview server config (npm run preview on :4173)
│  ├─ settings.json       ← permission allowlist
│  └─ commands/           ← /verify-scaffold, /phase, /check
├─ docs/                  ← 15 planning docs, README.md is the index
├─ src/                   ← Phase 0 scaffold (src/engine/ doesn't exist yet — Phase 1)
├─ tests/                 ← unit + e2e
├─ public/                ← icons, manifest assets, fonts README
├─ scripts/               ← generate-icons.py
└─ .github/workflows/     ← ci.yml, keepalive.yml
```
