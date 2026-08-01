# 07 — Statistics & Rankings

Everything here is **derived from `deliveries`**. No stat is ever hand-entered.
If a number looks wrong, `rebuild_innings()` fixes it.

---

## 1. Statistic definitions

### 1.1 Batting

| Stat | Formula | Notes |
|---|---|---|
| Innings | count of innings where the player faced ≥1 ball or was dismissed | |
| Runs | Σ `runs_batter` where `striker_id = player` | |
| Balls faced | count of deliveries where `striker_id = player` AND `extra_type != 'wide'` | wides are not faced |
| Not outs | innings where `status = 'not_out'` | |
| Highest score | max runs in an innings; `62*` if not out | |
| Average | `Runs / (Innings − NotOuts)` | `∞` shown as `–` when never out |
| Strike rate | `Runs / Balls × 100` | |
| 4s / 6s | count of `is_boundary_four` / `is_boundary_six` | |
| 50s | innings with 50 ≤ runs < 100 | |
| 100s | innings with runs ≥ 100 | |
| Ducks | innings dismissed for 0 | |
| Boundary % | `(4s×4 + 6s×6) / Runs × 100` | |
| Dot % faced | dots faced / balls faced | |

### 1.2 Bowling

| Stat | Formula | Notes |
|---|---|---|
| Overs | `floor(legalBalls / ballsPerOver).(legalBalls % ballsPerOver)` | |
| Maidens | overs where the bowler conceded 0 (byes/leg-byes excluded, wides/no-balls disqualify) | |
| Runs conceded | Σ `runs_total` excluding `bye` and `leg_bye` | |
| Wickets | count of dismissals credited to the bowler (see [04](./04-RULES-ENGINE.md) §5.1) | |
| Average | `RunsConceded / Wickets` | |
| Economy | `RunsConceded / (legalBalls / ballsPerOver)` | |
| Strike rate | `legalBalls / Wickets` | |
| Best (BBI) | best single-innings figures; sort by wickets desc, then runs asc | `5/21` |
| 3wi / 5wi | innings with ≥3 / ≥5 wickets | |
| Dot % | dots / legal balls | |
| Wides, No-balls | counts | |

### 1.3 Fielding

| Stat | Source |
|---|---|
| Catches | `fielder_id` on `wicket_type = 'caught'` |
| Stumpings | `fielder_id` on `wicket_type = 'stumped'` |
| Run outs | `fielder_id` on `wicket_type = 'run_out'` (direct) |
| Run out assists | `assist_fielder_id` |
| Total dismissals | catches + stumpings + run outs |

### 1.4 Career & splits

Every stat above is available:
- Career total
- Per team (a player in 3 teams has 3 splits + a combined)
- Per format (by `oversPerInnings` bucket: T10 ≤10, T20 ≤20, ODI ≤50, other)
- Per tournament (v1.1)
- Last 5 / 10 matches (form)
- Home vs away (v1.1)

---

## 2. Rating system

A single composite number per player, used to rank them. Design goals: **stable,
explainable, resistant to one-innings flukes, and fair to specialists**.

### 2.1 Per-match rating points

Each match produces `player_match_stats.rating_points`. Computed from three
independent components, each on a 0–100-ish scale.

#### Batting points

```
battingPoints =
    runs × 1.0
  + fours × 1.0
  + sixes × 2.0
  + (runs ≥ 50  ? 15 : 0)
  + (runs ≥ 100 ? 35 : 0)          // cumulative with the 50 bonus
  + strikeRateBonus
  − (dismissedForDuck ? 8 : 0)
  + (notOut && runs ≥ 20 ? 5 : 0)

strikeRateBonus =                   // only if balls ≥ 10
    clamp((strikeRate − parSR) × ballsFaced / 100, −20, +30)

parSR is format-dependent:  T10 150 · T20 130 · ODI 85 · other 110
```

#### Bowling points

```
bowlingPoints =
    wickets × 20
  + maidens × 12
  + dots × 0.5
  + (wickets ≥ 3 ? 15 : 0)
  + (wickets ≥ 5 ? 30 : 0)
  + economyBonus

economyBonus =                      // only if legalBalls ≥ 12
    clamp((parEcon − economy) × oversBowled × 2, −20, +30)

parEcon:  T10 9.5 · T20 8.0 · ODI 5.5 · other 7.0
```

#### Fielding points

```
fieldingPoints = catches × 8 + stumpings × 10
               + runOuts × 10 + runOutAssists × 5
```

#### Match rating

```
matchRating   = battingPoints + bowlingPoints + fieldingPoints
              + (isPlayerOfMatch ? 25 : 0)
              + (teamWon ? 10 : teamTied ? 5 : 0)

// Opposition strength multiplier — beating a strong team counts more
oppositionFactor = clamp(0.85 + oppTeamRating / 2000, 0.85, 1.25)

ratingPoints = matchRating × oppositionFactor
```

`oppTeamRating` = mean overall rating of the opposition's playing XI at the time
of the match, snapshotted so it never changes retroactively.

### 2.2 Career rating — exponentially weighted

Recent form matters more than a great season two years ago.

```
overallRating = Σ ( ratingPoints_i × decay_i ) / Σ decay_i × formFactor

decay_i    = 0.5 ^ (matchesSince_i / 20)     // half-life of 20 matches
formFactor = 1 + 0.15 × (avgLast5 / avgCareer − 1),  clamped to [0.85, 1.15]
```

Board-specific ratings use only the relevant component:

| Board | Rating source |
|---|---|
| **Overall** | full `ratingPoints` |
| **Batting** | `battingPoints` only |
| **Bowling** | `bowlingPoints` only |
| **All-rounder** | `2 × √(battingRating × bowlingRating)` — geometric mean, so you must be good at both |
| **Fielding** | `fieldingPoints` only |

### 2.3 Qualification thresholds

A player must meet these to appear on a board. Below the threshold they are
shown in a separate **"Emerging"** section with a `3/5 matches` progress ring —
visible, but not polluting the main ranking.

| Board | Minimum |
|---|---|
| Overall | 5 matches |
| Batting | 5 innings AND 60 balls faced |
| Bowling | 5 innings AND 30 overs bowled (180 legal balls) |
| All-rounder | qualifies for **both** batting and bowling |
| Fielding | 5 matches |

Thresholds are configurable in `app_settings` — a small league needs lower bars.

### 2.4 Confidence

Every rating carries a confidence level derived from sample size:

```
confidence = min(1, matchesPlayed / 15)
```

Displayed as a subtle 3-bar indicator next to the rating. Ratings with
confidence < 0.5 show in a lighter weight. This makes the ranking honest
without hiding new players.

---

## 3. The Ranks page

> **Requirement:** "There should be a Ranks page in which the player's ranking
> will be shown, and it should be filtered by teams that you want to choose.
> There should be a ranking without any filtering for all the players of all
> the teams."

### 3.1 Layout

```
┌─────────────────────────────────────────┐
│  RANKS                          [⚙]     │
├─────────────────────────────────────────┤
│  Overall  Batting  Bowling  AR  Field   │  board tabs (swipeable)
├─────────────────────────────────────────┤
│  🌐 All Teams  ×                        │  ← FILTER BAR
│  [+ Filter by team]                     │
├─────────────────────────────────────────┤
│  ╭───────────────────────────────────╮  │
│  │ 🥇 1  ⬆2   R Sharma        892.4  │  │  ← podium top 3
│  │        MUM · All-rounder    ▮▮▮   │  │     glass + gold rim
│  ╰───────────────────────────────────╯  │
│  ╭───────────────────────────────────╮  │
│  │ 🥈 2  ⬇1   J Bumrah        871.0  │  │
│  ╰───────────────────────────────────╯  │
│  ╭───────────────────────────────────╮  │
│  │ 🥉 3  —    V Kohli         864.2  │  │
│  ╰───────────────────────────────────╯  │
│  ─────────────────────────────────────  │
│   4  ⬆5    A Patel           798.1     │  ← dense rows
│   5  ⬇2    S Iyer            781.9     │
│   ...                                   │
│  ─────────────────────────────────────  │
│  ▸ Emerging (below qualification)  12   │
├─────────────────────────────────────────┤
│  ╭─ YOU ────────────────────────────╮   │  ← sticky "your rank" pill
│  │ 27  ⬆4   Rachit        512.6     │   │
│  ╰──────────────────────────────────╯   │
└─────────────────────────────────────────┘
```

### 3.2 Team filtering

- **Default: no filter.** The page opens on the **global ranking across every
  player of every team**, exactly as required. The chip reads `🌐 All Teams`.
- Tap `+ Filter by team` → a bottom sheet with a searchable, multi-select list
  of all teams, each with its crest and colour. Select any number.
- Selected teams appear as removable chips in the filter bar, coloured with each
  team's `primary_color`.
- Filter semantics: **a player is included if they are a current member of ANY
  selected team** (union, not intersection). A `Match all teams` toggle in the
  sheet switches to intersection for the rare "who plays for both?" case.
- **Ratings do not change when filtered.** The filter narrows the population;
  the numbers stay comparable. Rank *positions* renumber within the filtered set,
  and each row shows its global rank as a small ghost number so context isn't
  lost: `4  (#11 global)`.
- Filter state is encoded in the URL (`/ranks?board=batting&teams=a,b`) so a
  filtered board is shareable.
- The filter selection persists in `localStorage` per user.

### 3.3 Additional filters (in the `⚙` sheet)

| Filter | Options |
|---|---|
| Format | All · T10 · T20 · ODI · Other |
| Period | All time · This year · Last 90 days · Last 10 matches |
| Role | All · Batter · Bowler · All-rounder · Wicket-keeper |
| Min matches | slider, defaults to the board threshold |
| Include shadow players | on/off |

### 3.4 Row interactions

- Tap a row → the player's profile with full career stats and their rank history
  sparkline.
- Long-press → **Compare** mode: pick a second player, get a head-to-head
  radar chart (batting, bowling, fielding, consistency, impact).
- Swipe a row left → `Follow player`.

### 3.5 Movement indicators

`⬆2` / `⬇1` / `—` compare against `ranking_snapshots` from **7 days ago** for
the same `scope` and `board`. A new entrant shows a `NEW` badge.

### 3.6 Visual treatment

- Top 3 get elevated glass cards with a metallic gradient rim (gold/silver/bronze)
  and a slow shimmer sweep.
- Each row's left edge carries a 3px bar in the player's team colour.
- Rating numbers count up on mount, staggered 30ms per row.
- Rank changes since last visit animate: rows slide to their new positions with
  a `layoutId` spring on first render.
- The "YOU" pill is always docked at the bottom, and tapping it scrolls to your
  row with a highlight pulse.

---

## 4. Computation pipeline

```
  match completed
        │
        ▼
  [edge fn] finalize_match
    ├─ rebuild_innings() for both innings
    ├─ write batting_card_entries / bowling_card_entries
    ├─ write player_match_stats (incl. rating_points)
    ├─ set matches.is_locked = true
    └─ enqueue ranking recompute
        │
        ▼
  [edge fn] recompute_rankings   (also runs nightly at 03:00)
    ├─ rewrite player_career_stats table (plain table, not an MV)
    ├─ compute overall/batting/bowling/allrounder/fielding ratings
    ├─ compute global ranks
    ├─ compute per-team ranks (scope = 'team:<uuid>')
    └─ insert ranking_snapshots for today
```

- **Incremental on match completion** so the ranks page is fresh within seconds
  of the last ball.
- **Full nightly rebuild** so decay weighting (which changes with time, not
  events) stays accurate, and so any data correction propagates.
- Super Admin can trigger a full recompute manually from Admin → Data.

### Query for a filtered board

```sql
select
  pcs.player_id,
  p.full_name,
  pcs.overall_rating,
  rank() over (order by pcs.overall_rating desc) as filtered_rank,
  gr.rank as global_rank
from player_career_stats pcs
join players p on p.id = pcs.player_id
left join ranking_snapshots gr
       on gr.player_id = pcs.player_id
      and gr.scope = 'global' and gr.board = 'overall'
      and gr.snapshot_date = current_date
where pcs.matches_played >= :min_matches
  and ( :team_ids is null
        or exists (
          select 1 from team_members tm
           where tm.player_id = pcs.player_id
             and tm.left_at is null
             and tm.team_id = any(:team_ids) ) )
order by pcs.overall_rating desc
limit 100;
```

---

## 5. Player profile page

Reached from anywhere a player's name appears.

- Hero: photo, name, team chips, self-set role badges, current overall rank.
- Rating history sparkline over the last 20 matches.
- Career table: batting / bowling / fielding, with a format toggle.
- Form strip: last 10 matches as coloured tiles (runs and wickets), tap for that match.
- Milestones: 50s, 100s, 5-fors, hat-tricks — as collectible-looking badges.
- "vs Teams" breakdown table.
- If viewing **your own** profile: an `Edit role` button, prominently, since
  role self-management is a core requirement. Plus any pending role suggestions
  from team admins, with accept/reject.
