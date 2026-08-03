# 00 — Product Overview

## 1. Vision

A cricket match happening on a maidan, in a school ground, or at a corporate
tournament is scored today on paper or in an ugly spreadsheet. **CricLife** turns
any phone into a broadcast-grade scoring console and turns every spectator's
phone into a live scoreboard.

Three non-negotiable product qualities:

1. **Zero-scroll scoring.** The person scoring is standing in the sun holding a
   phone in one hand. Every common action must be one thumb-tap, above the fold,
   always. See [05-SCORER-VIEW](./05-SCORER-VIEW.md).
2. **Futuristic and alive.** Animated, glassy, neon-accented, motion-rich.
   Numbers count up. Wickets shake the screen. Sixes ripple. Not a spreadsheet.
   See [08-DESIGN-SYSTEM](./08-DESIGN-SYSTEM.md).
3. **Truthful data.** Cricket has fiddly laws. If the app computes a strike
   rotation or an economy rate wrong, nobody trusts it again. See
   [04-RULES-ENGINE](./04-RULES-ENGINE.md).

---

## 2. Who uses it

| Persona | Context | Primary need |
|---|---|---|
| **Ravi — Super Admin** | Runs the local league | Full control, fix anything, resolve disputes |
| **Priya — Team Admin** | Captain of a team | Create team, add players, set squad for a match |
| **Arjun — Scorer** | Sitting on the boundary | Record balls fast, one hand, never miss a ball |
| **Sara — Player** | Playing or benched | Set her role, view her stats and rank |
| **Dev — Audience** | At work, following remotely | Live score, ball-by-ball feed, no login needed |

One human can hold several of these at once. Arjun is also a Player. Priya is
also a Scorer.

---

## 3. Core feature set (v1)

### 3.1 Teams & Players
- Create a team: name, short code (3 letters), colours, logo, home ground.
- Add players to a team — either by inviting an existing user account or by
  creating a **shadow player** (a player record with no login yet, claimable later).
- A player can belong to multiple teams.
- **A player controls their own playing role.** Roles: `batter`, `bowler`,
  `all_rounder`, `wicket_keeper`, `wk_batter`. Plus batting hand
  (`right`/`left`) and bowling style (`right_arm_fast`, `left_arm_orthodox`, etc.).
- Team Admin can *suggest* a role; only the player (or Super Admin) can set it.

### 3.2 Matches
- Create a match: two teams, venue, date/time, **overs per innings (configurable)**,
  and a full config block (see § Match Configuration in the rules doc).
- Toss: winner, decision (bat/bowl).
- Playing squad selection per team. Size is `playersPerSide` from the match
  config — 11 by default, valid from 2 upwards. Nothing assumes eleven.
- Match states: `scheduled → toss → live → innings_break → live → completed`
  plus `abandoned` and `super_over`.

### 3.3 Scoring rights (the token system)
- The match has a set of **scoring grants**.
- The match creator, either Team Admin, or Super Admin can **issue** a scoring
  grant to any user.
- Multiple people can hold a grant at once (co-scoring / redundancy).
- A holder can **pass** their grant to someone else, and can optionally be
  given `can_delegate` so they can issue further grants.
- Any grant can be **revoked** instantly by the match owner or Super Admin.
- Conflicting simultaneous entries are resolved by an append-only delivery log
  with server-side sequence numbers. See [03-ROLES-PERMISSIONS](./03-ROLES-PERMISSIONS.md).

### 3.4 Scorer View
- One screen. No scroll. Big touch targets.
- Run buttons 0–6, wide, no-ball, bye, leg-bye, wicket.
- Undo the last ball. Edit any earlier ball (audit-logged).
- Auto strike rotation, auto over completion, auto bowler prompt.
- Works offline; queues and syncs.

### 3.5 Audience View
- Public link, no login. Live score, run rate, required rate, this-over dots,
  current batters and bowler, ball-by-ball commentary feed, win-probability bar,
  and a manhattan/worm chart.
- Real-time push, sub-second.

### 3.6 Archive & Stats
- Every completed match is immutable and permanently stored with its full
  ball-by-ball log.
- Player career stats computed from the delivery log (batting, bowling, fielding).
- Per-format and per-tournament splits.

### 3.7 Ranks page
- Leaderboard of players.
- **Filter by any subset of teams** (multi-select chips).
- **Unfiltered global ranking** across every player of every team — the default view.
- Separate boards: Overall Rating, Batting, Bowling, All-rounder, Fielding.
- Minimum-qualification thresholds so a player with one lucky innings doesn't top it.
- Formula in [07-STATS-AND-RANKINGS](./07-STATS-AND-RANKINGS.md).

### 3.8 Settings
- **App settings** (Super Admin): default overs, default rules profile, branding.
- **Match settings** (per match): overs, powerplays, max overs per bowler, wide/no-ball
  run values, free hit on/off, last-man-standing on/off, super over on/off.
- **User settings**: theme (dark/light/system), accent colour, haptics, sound,
  scorer button layout (left/right-handed), notifications.

---

## 4. Explicitly out of scope for v1

- Test / multi-day cricket (innings declarations, follow-on). Data model leaves
  room; UI does not ship it.
- DLS (Duckworth–Lewis–Stern) rain calculation. We store the data needed to add
  it later (`overs_lost`, `interruptions`) but v1 shows a manual revised target field.
- Video, ball tracking, wagon wheels from real coordinates (we do offer an
  *optional* tap-the-field shot placement — see [05-SCORER-VIEW](./05-SCORER-VIEW.md) § Advanced Mode).
- Payments, subscriptions, ads.
- Native app store distribution. This is an installable PWA.

---

## 5. Success criteria

| Metric | Target |
|---|---|
| Taps to record a normal 1-run ball | 1 |
| Taps to record a wicket with fielder credit | 3 |
| Scroll required during scoring | 0px |
| Audience score latency after scorer tap | < 1.5s p95 |
| Scoring works with no network | Yes, unlimited duration |
| Lighthouse mobile performance | ≥ 90 |
| Time to create a team with a full side | < 3 minutes |

---

## 6. Glossary

| Term | Meaning |
|---|---|
| **Delivery** | One ball bowled, legal or not. The atomic unit of the whole app. |
| **Legal delivery** | A ball that counts toward the six of an over (not a wide or no-ball). |
| **Extras** | Runs not credited to the batter: wide, no-ball, bye, leg-bye, penalty. |
| **Strike** | Which of the two batters is facing. |
| **Scoring grant** | A revocable, transferable right to record deliveries in a match. |
| **Shadow player** | A player record with no linked user account yet. |
| **Rules profile** | A named bundle of match config (e.g. "T20 Standard", "Gully 8-over"). |
