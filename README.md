# 🏏 CricLife

> Futuristic, mobile-first, real-time cricket scoring, statistics and rankings.
> Installable PWA. Runs on free tiers.

**Status:** Phase 0 complete — foundations scaffolded and deployed.
**Live:** `criclife.geminirachit.workers.dev` · `criclife.is-a.dev` *(pending PR)*

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in Supabase values
npm run dev
```

Full setup, including the accounts and free domains you need to create:
**[SETUP.md](./SETUP.md)**

---

## What it does

- **Score a match from your phone** on a screen that never scrolls — one thumb,
  one tap per ball.
- **Pass scoring rights around** with a transferable, revocable token that
  several people can hold at once, visualised on a live Scoring Rights Map.
- **Players own their own profile** — you set your own role, batting hand and
  bowling style. Team admins can suggest, not impose.
- **Anyone can watch** on a public link with no login: live score, ball-by-ball
  feed, charts and celebrations.
- **Everything is kept.** Full ball-by-ball archive, career stats, and a
  rankings board filterable by any set of teams — or unfiltered across everyone.

Overs per innings is configurable, along with balls per over, players per side,
bowler limits, powerplays, free hits and super overs.

---

## Documentation

Fifteen planning documents in [`docs/`](./docs/README.md). Read
[`docs/README.md`](./docs/README.md) first — it is the index.

The three that matter most:

| Doc | Why |
|---|---|
| [04-RULES-ENGINE](./docs/04-RULES-ENGINE.md) | Cricket's laws encoded. Build this before any UI. |
| [03-ROLES-PERMISSIONS](./docs/03-ROLES-PERMISSIONS.md) | The scoring token and the RLS model. |
| [05-SCORER-VIEW](./docs/05-SCORER-VIEW.md) | The zero-scroll layout budget. |

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :5173 |
| `npm run build` | Production build |
| `npm run typecheck` | Strict TypeScript, no emit |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright — includes the no-scroll gate |
| `npm run size` | Bundle size budget |
| `npm run icons` | Regenerate PWA icons (needs Python + Pillow) |

---

## Architecture in one paragraph

React 19 + Vite PWA on Cloudflare Workers (Static Assets), Supabase (Postgres + RLS + Realtime +
Auth) as the backend. The **cricket rules engine in `src/engine/` is pure** — no
React, no network, no DOM, no ambient time — and every score in the app is a
projection of the append-only `deliveries` log through it. Scoring writes to
IndexedDB first and the network second, so the pad never waits and a whole match
can be scored offline. Full detail:
[`docs/09-ARCHITECTURE.md`](./docs/09-ARCHITECTURE.md).

---

## Roadmap

| Phase | | |
|---|---|---|
| 0 | Foundations | ✅ scaffolded |
| 1 | Rules engine | ⬜ next |
| 2 | Data layer & auth | ⬜ |
| 3 | Teams, players, self-managed roles | ⬜ |
| 4 | Match setup & the scoring token | ⬜ |
| 5 | Scorer view | ⬜ |
| 6 | Offline & concurrency | ⬜ |
| 7 | Audience view | ⬜ |
| 8 | Stats & ranks | ⬜ |
| 9 | Admin, polish, launch | ⬜ |

Acceptance criteria per phase: [`docs/12-ROADMAP.md`](./docs/12-ROADMAP.md).
