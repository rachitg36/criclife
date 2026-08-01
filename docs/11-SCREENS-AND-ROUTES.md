# 11 — Screens & Routes

Complete inventory. Every screen lists its route, who can reach it, and what's
on it. Build order is in [12-ROADMAP](./12-ROADMAP.md).

---

## Navigation model

**Bottom tab bar** (authenticated shell), 5 items:

```
  ⌂ Home    ⚑ Teams    ⊕ Match    ↕ Ranks    ⚙ More
```

- `⊕ Match` is a raised centre button — the primary action is always
  "start or resume a match".
- The bar hides entirely inside the scorer view (which has its own tabs) and in
  big-screen mode.
- Audience view has no tab bar — it's a public standalone page.

---

## 1. Auth & onboarding

| Route | Access | Content |
|---|---|---|
| `/login` | public | Animated aurora hero, magic-link email input + Google button. Single field, no password. (No phone OTP — SMS costs money.) |
| `/auth/callback` | public | Token exchange + redirect |
| `/onboarding` | authed, first run | 3 steps: (1) name + photo, (2) "Are you a player?" → set your own role, batting hand, bowling style, (3) create or join a team, or skip. Also handles a `claimCode` deep link. |

---

## 2. Home

| Route | Access | Content |
|---|---|---|
| `/` | authed | **Live now** carousel (matches in progress, animated score cards) · **Your next match** card with a "Score this match" CTA if you hold a grant · **Recent results** · **Your form** strip (last 5 matches) · **Your rank** card with movement · quick actions: New match, New team |

Empty state: an illustrated "Let's get you started" with two CTAs.

---

## 3. Teams

| Route | Access | Content |
|---|---|---|
| `/teams` | authed | Your teams (crest, name, P-W-L, squad count) + a searchable "All teams" section |
| `/teams/new` | authed | Name, 3-letter code, colour picker (two swatches, live preview of the crest and of the app tint), logo upload, home ground, city |
| `/teams/:teamId` | public read | Hero with crest + colours · tabs: **Squad · Matches · Stats · Ranks** |
| `/teams/:teamId/squad` | public read | Player list grouped by role, each with rank and form. Manager sees `+ Add player` and per-row `⋯` (edit name/number, remove, suggest role) |
| `/teams/:teamId/add-player` | manager | Two paths: **Invite an existing user** (search by handle/email) or **Create a shadow player** (name only, generates a claim code + shareable link) |
| `/teams/:teamId/matches` | public read | Past and upcoming |
| `/teams/:teamId/stats` | public read | Team aggregates + leading run scorers / wicket takers |
| `/teams/:teamId/settings` | owner/admin | Rename, colours, logo, member roles (owner/admin/captain/VC/player), transfer ownership, archive team |

---

## 4. Players

| Route | Access | Content |
|---|---|---|
| `/players/:playerId` | public read | Profile hero (photo, name, team chips, **self-set role badges**, overall rank) · rating sparkline · career table with format toggle · form strip · milestones · vs-teams breakdown |
| `/players/:playerId/edit` | **self** or Super Admin | **Playing role** (primary + secondary), batting hand, bowling style, short name, jersey number, photo, bio. A lock notice if `role_locked_by_admin`. Pending role suggestions from admins appear here with Accept / Reject. |
| `/players/claim` | authed | Enter a claim code, or arrive via deep link, to take ownership of a shadow player record |

> `/players/:playerId/edit` is the screen that satisfies "players should have
> permissions to update their own roles". It must be reachable in one tap from
> the profile and from Settings.

---

## 5. Matches

| Route | Access | Content |
|---|---|---|
| `/matches` | authed | Segmented: **Live · Upcoming · Completed**. Filter by team. |
| `/matches/new` | manager | **4-step wizard**, one step per screen, no scrolling: ① Teams ② Format & settings (rules profile picker, then **overs per innings**, balls/over, players/side, max overs per bowler, powerplays, free hit, super over) ③ Venue & time ④ Scoring rights (pick who can score — pre-filled with you) |
| `/matches/:matchId` | public read | **Hub.** Routes by context: pre-toss → setup CTA; live + you hold a grant → big "Resume scoring" button; live otherwise → audience view; completed → scorecard |
| `/matches/:matchId/setup` | manager | Toss (coin animation, winner, bat/bowl) → XI selection for both teams (drag to reorder batting order, tap to set captain and keeper) → openers and opening bowler |
| `/matches/:matchId/score` | **grant holder** | **THE SCORER VIEW.** See [05](./05-SCORER-VIEW.md). Sub-tabs: Score · Scorecard · Map · Feed · Settings |
| `/matches/:matchId/rights` | manager or holder | **SCORING RIGHTS MAP.** See [03](./03-ROLES-PERMISSIONS.md) §3.4. Graph of who holds scoring rights; issue, pass, revoke, scope, expiry, QR handoff |
| `/matches/:matchId/scorecard` | public read | Full cards, both innings |
| `/matches/:matchId/feed` | public read | Ball-by-ball; scorer can edit commentary inline |
| `/matches/:matchId/settings` | manager | Live-editable config subset, audit trail of config changes |
| `/matches/:matchId/review` | grant holder | **Review Tray** — offline balls the server rejected, with per-ball resolve actions |

---

## 6. Audience (public)

| Route | Access | Content |
|---|---|---|
| `/live/:publicSlug` | **public, no auth** | See [06](./06-AUDIENCE-VIEW.md). Hero score, win probability, this-over strip, batters, bowler, tabs: Live · Scorecard · Charts · Squads |
| `/live/:publicSlug?tv=1` | public | Big-screen 16:9 kiosk layout |
| `/live/:publicSlug` (completed) | public | Result hero, Player of the Match, **replay scrubber**, full cards and charts |

---

## 7. Ranks

| Route | Access | Content |
|---|---|---|
| `/ranks` | public read | **Default = global, unfiltered, all players of all teams.** Board tabs: Overall · Batting · Bowling · All-rounder · Fielding. Team multi-select filter chips. Podium top 3 + dense rows. Sticky "your rank" pill. Emerging section. |
| `/ranks?board=x&teams=a,b` | public read | Shareable filtered state |
| `/ranks/compare?a=..&b=..` | public read | Head-to-head radar + stat table |

---

## 8. Stats

| Route | Access | Content |
|---|---|---|
| `/stats` | public read | League-wide leaderboards: most runs, most wickets, best average, best economy, most sixes, most catches, highest score, best figures. Same team filter as Ranks. Format and period filters. |

---

## 9. Settings

| Route | Access | Content |
|---|---|---|
| `/settings` | authed | Index |
| `/settings/profile` | authed | Display name, handle, avatar, email, phone. Link to your **player profile & role**. |
| `/settings/appearance` | authed | **Theme: Dark / Light / Auto** · accent colour presets · "Tint to batting team" toggle · **Calm mode** (disable animations) · text size |
| `/settings/scoring` | authed | Handedness (mirrors the pad) · haptics · sound · Advanced Mode (shot/pitch capture) · keep screen awake · confirm-before-wicket |
| `/settings/notifications` | authed | Web push toggles: scoring rights granted/revoked, match starting, followed players' milestones, weekly rank change |
| `/settings/data` | authed | Offline cache size, clear cache, export your data (JSON), delete account |
| `/settings/about` | authed | Version, changelog, credits, install-as-app prompt |

---

## 10. Admin (Super Admin only)

| Route | Content |
|---|---|
| `/admin` | Dashboard: counts, recent activity, system health, pending sync failures |
| `/admin/users` | All profiles; grant/revoke Super Admin; impersonate (audit-logged); suspend |
| `/admin/players` | Merge duplicates, lock/unlock roles, manage shadow players |
| `/admin/teams` | All teams, archive, transfer ownership |
| `/admin/matches` | All matches, **unlock a completed match**, force-complete, delete (soft) |
| `/admin/grants` | Every scoring grant across all matches, global revoke |
| `/admin/rules-profiles` | Create and edit named rules profiles; set the app default |
| `/admin/settings` | App name, branding, default overs, public audience on/off, self-signup on/off, ranking thresholds |
| `/admin/data` | Rebuild innings, recompute rankings, rewrite career stats, integrity report |
| `/admin/audit` | Filterable audit log with before/after diffs |

---

## 11. System screens

| Route | Content |
|---|---|
| `/offline` | SW fallback: "You're offline. Your 7 unsynced balls are safe." + queue status |
| `/404` | Illustrated, with a search box |
| `/error` | Error boundary fallback with a Sentry event ID and a reload action |

---

## 12. Screen count summary

| Area | Screens |
|---|---|
| Auth & onboarding | 3 |
| Home | 1 |
| Teams | 8 |
| Players | 3 |
| Matches | 9 |
| Audience | 3 |
| Ranks | 3 |
| Stats | 1 |
| Settings | 7 |
| Admin | 10 |
| System | 3 |
| **Total** | **51** |

Phase 1 (see roadmap) ships roughly 20 of these.
