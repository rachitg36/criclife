# 13 — Open Questions & Decisions Log

Things I decided on your behalf (with reasoning), and things I still need from
you before Phase 0.

---

## A. Decisions I made — flag any you disagree with

| # | Decision | Reasoning | Reversible? |
|---|---|---|---|
| A1 | **React + Vite PWA**, not Flutter or React Native | You said no app stores. A PWA installs to the home screen, updates instantly, and the same code serves a scorer's phone, a spectator's laptop, and a TV at the ground. | Hard — it's the foundation |
| A2 | **Supabase** over Firebase | Your scoring-token model is a row-level authorization problem, which is exactly what Postgres RLS is for. Rankings are aggregate SQL. Firestore would fight you on both. | Medium — the data layer is isolated |
| A3 | **Offline-first scoring** | Grounds have bad signal. This is the difference between an app people use and one they abandon after one match. | Medium |
| A4 | **Full limited-overs rules**, DLS and Test cricket deferred | Free hits, super overs, and powerplays matter in real games. DLS needs tuning data you don't have yet. | Easy — additive |
| A5 | **Dark mode is the default** | The design is dark-first; light is a real second theme, not an inversion. | Easy |
| A6 | Team colours **tint the whole UI** during a live match | Signature touch, makes the app feel present at the match. Auto contrast-corrected in OKLCH. | Easy |
| A7 | The "map" you asked for = a **Scoring Rights Map** — a live graph of who holds scoring rights | It's the reading that fits the sentence and it makes a genuinely useful screen. If you meant a *field map* (fielder positions) or a *wagon wheel*, tell me — the wagon wheel is already in the plan as Advanced Mode. | Easy |
| A8 | Team admins **cannot** change a player's role; they can only *suggest* it | You said players own their roles. A suggestion flow keeps admins useful without breaking that. | Easy |
| A9 | **Shadow players** (no login required) | A captain adding 10 teammates should not need 10 people to sign up first. | Medium |
| A10 | Deliveries are **append-only with soft delete + audit** | Disputed scores are the #1 social problem in amateur cricket. A perfect history settles arguments. | Hard |
| A11 | Undo works by **replaying the innings**, not reversing a ball | Reversal logic is where scoring apps get subtly wrong. Replay of 130 rows takes 15ms. | Easy |
| A12 | Ranking uses **exponential decay with a 20-match half-life** + qualification thresholds | Recent form should matter; one lucky innings shouldn't top the board. | Easy — it's a formula |
| A13 | Audience view is **public, no login**, via an unguessable slug | Sharing a link in a WhatsApp group is the growth mechanic. | Easy |
| A14 | Scorer view has a **reduced** animation budget vs the audience view | The scorer needs speed; the audience wants fireworks. | Easy |

---

## B. Questions I need answered before Phase 0

> ✅ **B1, B3, B5, B7 and B10 are answered.** See § E at the bottom for the
> answers and what changed as a result. B2, B4, B6, B8 and B9 are still open,
> and none of them block Phase 0.

### B1. Scale — ✅ ANSWERED: under 20 teams
~~How many teams, players, and matches per month do you expect in year one?~~
- **< 20 teams** → Supabase free tier is fine, `player_career_stats` becomes a
  plain table instead of a materialized view, no partitioning needed.
- **> 200 teams** → we'd plan partitioning on `deliveries` and a read replica
  for the audience view. Not needed now.

### B2. Who can create teams?
Currently: anyone signed in can create a team and becomes its owner.
Alternatives: only Super Admin creates teams; or creation requires approval.
Which fits how you'll run this?

### B3. One league or a public platform? — ✅ ANSWERED: one league, possibly growing
- **One club/league** → single tenant, Super Admin curates everything. No
  multi-tenancy work in v1, but nothing in the schema prevents adding a
  `league_id` later if it grows.
- ~~Public platform → multi-tenant boundaries, per-league Super Admins,
  moderation, abuse handling.~~ Deferred.

### B4. Tournaments in v1?
The schema leaves `tournament_id` on `matches`, but no tournament UI is planned
for v1. If you need a points table and fixtures on day one, that's roughly one
extra phase.

### B5. Audience view login? — ✅ ANSWERED: public, no login
Confirmed. `allow_public_audience = true`. The `anon` read policies in doc 03 §6
stand as written. The kill switch stays in `app_settings` in case you ever want
to lock a private tournament.

### B6. Rankings — teams or players?
You asked for player rankings. Do you also want a **team** ladder
(points table, win %, NRR)? Not currently planned.

### B7. Multi-language? — ✅ ANSWERED: English only
No i18n library, no translation files, hardcoded strings. Saves real complexity.
Mitigation for later: keep user-facing strings out of deeply nested JSX where
practical, so a retrofit is annoying rather than painful.

### B8. Web push notifications
Worth the setup cost in v1? They need VAPID keys and, on iOS, only work for
installed PWAs. Currently planned for Phase 9.

### B9. Historic data import
Do you have past matches in a spreadsheet you want loaded so the rankings
aren't empty on day one? If so, we should design the importer in Phase 2.

### B10. Domain and branding — ✅ ANSWERED: CricLife, free domains
Name is **CricLife**. Domains are free:
- ~~`criclife.pages.dev` — Cloudflare Pages~~ **Superseded, 2026-08-01:**
  Cloudflare retired the Pages dashboard flow; deployed instead to
  **`criclife.geminirachit.workers.dev`** (Cloudflare Workers Static Assets —
  same free tier, new product/subdomain shape). See
  [14-FREE-TIER-PLAN](./14-FREE-TIER-PLAN.md) § 1.
- `criclife.is-a.dev` — **verified available on 2026-08-01**, free forever, PR not yet opened

Supabase does *not* provide a website URL (only `<ref>.supabase.co` for the API).
Firebase Hosting would give `criclife.web.app`, but Cloudflare's free static
hosting is the better host. Full comparison in
[14-FREE-TIER-PLAN](./14-FREE-TIER-PLAN.md) § 1.

---

## C. Things deliberately left vague until we build

| Item | Why defer |
|---|---|
| Exact win-probability constants | Needs real match data to tune; the heuristic ships labelled "estimate" |
| `parSR` / `parEcon` per format in the rating formula | Same — tune once there's a season of data |
| Ranking qualification thresholds | Configurable in `app_settings`; a 6-team league needs lower bars than a 40-team one |
| Illustration style for empty states | Design decision, low risk, do it in Phase 9 |
| Commentary phrase pools | Easy to expand; the structure is what matters |
| Wagon wheel coordinate capture UX | Advanced Mode is optional and off by default; iterate with a real scorer |

---

## D. My recommended immediate next step

~~Answer B1, B3, B5 and B10.~~ **Done.** ~~Start **Phase 0**...~~ **Done** —
deployed to `criclife.geminirachit.workers.dev`, repo public at
[github.com/rachitg36/criclife](https://github.com/rachitg36/criclife). See
the free-tier checklist in [14-FREE-TIER-PLAN](./14-FREE-TIER-PLAN.md) § 7 for
what's still outstanding (Supabase, Resend, the is-a.dev PR).

Then **Phase 1 (the rules engine)**. It's the only part where a mistake is
expensive to undo, it needs no design decisions, and it can be built and fully
tested before a single pixel exists.

---

## E. Decisions log — answered 2026-08-01

| Q | Answer | Consequence |
|---|---|---|
| **B1 Scale** | Under 20 teams | Entire stack fits free tiers with ~10× headroom. `player_career_stats` becomes a plain table, not a materialized view. No partitioning, no read replica. |
| **B3 Tenancy** | One league, possibly growing | Single tenant. No `league_id`, no per-league admins, no moderation tooling in v1. Schema doesn't preclude adding it. |
| **B5 Audience** | Public, no login | `anon` SELECT policies as specced. Public slug URLs. Anonymous viewers don't count toward the 50k MAU auth limit — helpful for staying free. |
| **B7 Language** | English only | No i18n. Removed from Phase 0. |
| **B10 Name/domain** | **CricLife**, on `criclife.geminirachit.workers.dev` + `criclife.is-a.dev` | Both free. Hosting moved from Vercel to Cloudflare (Pages, then superseded by Workers Static Assets — see 14 § 1). New doc 14 covers the whole free-tier plan. |
| **Budget** (implied) | Everything on free tiers | Four changes: Cloudflare over Vercel; keepalive cron for the 7-day Supabase pause; no phone OTP (Resend SMTP instead); plain table over MV. First paid upgrade would be Supabase Pro at $25/mo, triggered at ~200 concurrent viewers. |

### Still open, none blocking

**B2** who can create teams · **B4** tournaments in v1 · **B6** team ladder as
well as player ranks · **B8** web push in v1 · **B9** importing historic matches

---

## D. My recommended immediate next step

Answer **B1, B3, B5 and B10** — those four change the architecture. The rest can
be decided as we build.

Then start **Phase 1 (the rules engine)**. It's the only part where a mistake is
expensive to undo, it needs no design decisions, and it can be built and fully
tested before a single pixel exists.
