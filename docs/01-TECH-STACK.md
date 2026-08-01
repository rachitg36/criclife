# 01 — Tech Stack

## Decision summary

You asked for a **web app on mobile**, **futuristic**, **dynamic and very visual**,
with **dark and light mode**, running **entirely on free tiers**. Here is the
recommended stack and why each piece earns its place.

> **Cost:** every service below has a free tier that comfortably fits your scale.
> The full arithmetic, the free domain, and the exact points where you'd have to
> start paying are in **[14-FREE-TIER-PLAN](./14-FREE-TIER-PLAN.md)**.

| Layer | Choice | Why |
|---|---|---|
| Framework | **React 19 + TypeScript** | Largest ecosystem for the animation/chart libs we need |
| Build | **Vite 6** | Instant HMR, tiny production bundle, first-class PWA plugin |
| Install/offline | **vite-plugin-pwa (Workbox)** | Installable to home screen, precached shell, offline scoring |
| Styling | **Tailwind CSS v4** | Token-driven; dark/light via CSS variables, no runtime cost |
| Components | **shadcn/ui (Radix primitives)** | Accessible, unstyled-by-default, we own the code |
| Animation | **Motion (framer-motion v12)** | Layout animations, gestures, spring physics — the "alive" feel |
| Charts | **Recharts** + hand-rolled SVG | Manhattan, worm, run-rate; SVG for the pitch/field maps |
| Client state | **Zustand** | Tiny, no boilerplate, perfect for live match state |
| Server state | **TanStack Query v5** | Caching, optimistic updates, offline mutation queue |
| Local DB | **Dexie (IndexedDB)** | Offline delivery queue and cached match state |
| Routing | **React Router v7** (declarative mode) | Nested layouts for scorer/audience shells |
| Forms | **React Hook Form + Zod** | One Zod schema shared by client and server validation |
| Backend | **Supabase** | Postgres + Realtime + Auth + RLS + Storage + Edge Functions |
| Realtime | **Supabase Realtime (Postgres changes + Broadcast)** | Push deliveries to audience in <1s |
| Auth | **Supabase Auth** — magic link + Google | No password to remember at a cricket ground. *Phone OTP dropped — Twilio costs money, see [14](./14-FREE-TIER-PLAN.md).* |
| Email (magic links) | **Resend** free tier as Supabase custom SMTP | Supabase's built-in sender is rate-limited to a handful per hour |
| Hosting | **Cloudflare Workers (Static Assets)** | Unlimited bandwidth, commercial use permitted on free, never pauses your site. *Chosen over Vercel — see [14](./14-FREE-TIER-PLAN.md) § 4.1. Live at `criclife.geminirachit.workers.dev`.* |
| Testing | **Vitest** + **React Testing Library** + **Playwright** | Rules engine gets exhaustive unit tests |
| Errors | **Sentry** | Ball-entry failures must never be silent |

---

## Why Supabase over Firebase

Your permission model is the hard part of this app: a *transferable, revocable,
multi-holder scoring token*. That is a **row-level authorization** problem.

- Supabase RLS is Postgres policies — you express "this user holds an active
  scoring grant for this match" as a SQL `EXISTS` clause. Readable, testable,
  enforced in the database, impossible to bypass from the client.
- Firestore security rules would need denormalised copies of the grant list on
  every document and get brittle fast.
- Stats and rankings are aggregate queries over hundreds of thousands of
  deliveries. That is SQL's home turf — materialized views and window functions.
  Firestore would require maintaining counters by hand.

Supabase also gives us Realtime on the same rows, so the audience view is
`supabase.channel().on('postgres_changes', ...)` with no extra infrastructure.

---

## Why a PWA and not React Native

You said no app stores. A PWA gives you:

- Home-screen install with a splash screen and no browser chrome
  (`display: standalone`) — visually indistinguishable from a native app.
- Service worker offline scoring.
- Instant updates, no review process.
- One codebase serves the scorer's phone, a spectator's laptop, and a TV
  browser showing the audience view on a big screen at the ground.

Trade-offs we accept: no background push on iOS unless installed
(iOS 16.4+ supports web push for installed PWAs — good enough), and no
App Store discovery (irrelevant here).

---

## Futuristic visual stack

These are the specific libraries that create the "not a spreadsheet" feel.
Full spec in [08-DESIGN-SYSTEM](./08-DESIGN-SYSTEM.md).

| Effect | Implementation |
|---|---|
| Glassmorphism panels | `backdrop-filter: blur()` + layered translucent borders |
| Neon accent glow | Multi-layer `box-shadow` in the accent hue, dimmed in light mode |
| Animated aurora background | Single CSS `@property` driven conic gradient, GPU-only |
| Count-up score numbers | `motion` `useSpring` + `useTransform` on a tabular-nums span |
| Six / four celebrations | Full-screen particle burst (canvas, ~40 particles, 800ms) |
| Wicket reaction | Screen shake + red vignette + haptic pulse |
| Live ball feed | `<AnimatePresence>` list with spring layout shifts |
| Route transitions | Shared-element `layoutId` on team crests |
| Charts | Recharts with animated `<Line isAnimationActive>` |
| Haptics | `navigator.vibrate()` on every scorer tap |

**Performance guardrail:** all of the above must respect
`prefers-reduced-motion` and must be disable-able in user settings. The scorer
view runs a *reduced* effects budget by default — the scorer needs speed, the
audience gets the fireworks.

---

## Dark / light mode

- Implemented as CSS custom properties on `:root` and `[data-theme="light"]`.
- Three user options: `dark`, `light`, `system`.
- **Dark is the default.** The design is built dark-first; light is a genuine
  second theme, not an inversion.
- Accent colour is user-selectable and additionally **auto-derived from the
  batting team's colour** during a live match — the whole UI tints toward
  whoever is batting. This is a signature touch.
- Theme is stored in `localStorage` and applied by a blocking inline script in
  `index.html` to prevent a flash of wrong theme.

---

## Repository layout (monorepo-lite, single package)

```
cricket-app/
├─ docs/                      ← these planning files
├─ supabase/
│  ├─ migrations/             ← versioned SQL
│  ├─ functions/              ← edge functions (stats rollup, ranking recompute)
│  └─ seed.sql
├─ src/
│  ├─ app/                    ← routes, layouts, providers
│  ├─ features/               ← teams, players, matches, scoring, stats, ranks
│  ├─ engine/                 ← PURE cricket rules engine, zero React imports
│  ├─ components/ui/          ← shadcn primitives
│  ├─ components/viz/         ← charts, field map, pitch map
│  ├─ lib/                    ← supabase client, dexie, sync, utils
│  ├─ hooks/
│  ├─ stores/                 ← zustand
│  └─ styles/
├─ tests/
│  ├─ engine/                 ← exhaustive rules tests
│  └─ e2e/                    ← playwright
└─ public/
```

**Hard rule:** `src/engine/` imports nothing from React, Supabase, or the DOM.
It is a pure function library: `(MatchState, DeliveryInput) => MatchState`.
This is what makes the app testable and the scores trustworthy.

---

## Environment variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SENTRY_DSN
VITE_APP_ENV                 # local | preview | production
SUPABASE_SERVICE_ROLE_KEY    # edge functions only, never shipped to client
```

---

## Browser support

- iOS Safari 16.4+
- Chrome/Edge Android 110+
- Modern desktop evergreen browsers

`backdrop-filter`, CSS nesting, `@property`, `View Transitions API`
(progressive enhancement — falls back to a cross-fade).
