# 02 — Data Model

Target: **PostgreSQL (Supabase)**. All tables have `id uuid primary key default gen_random_uuid()`,
`created_at timestamptz default now()`, `updated_at timestamptz default now()`
unless noted otherwise.

---

## 1. Entity relationship overview

```
                         ┌─────────────┐
                         │   users     │  (Supabase auth.users mirror)
                         └──────┬──────┘
                                │ 1:1
                         ┌──────▼──────┐
              ┌──────────│  profiles   │──────────┐
              │          └──────┬──────┘          │
              │                 │ 1:0..1          │
              │          ┌──────▼──────┐          │
              │          │   players   │          │
              │          └──┬───────┬──┘          │
              │             │       │             │
     ┌────────▼────────┐    │       │    ┌────────▼──────────┐
     │  team_members   │◄───┘       └───►│ player_match_stats│
     └────────┬────────┘                 └───────────────────┘
              │                                    ▲
     ┌────────▼────────┐                           │
     │      teams      │                           │
     └────────┬────────┘                           │
              │                                    │
     ┌────────▼────────┐   ┌──────────────┐        │
     │    matches      │──►│ match_squads │────────┘
     └───┬─────────┬───┘   └──────────────┘
         │         │
         │    ┌────▼──────────────┐
         │    │ scoring_grants    │
         │    └───────────────────┘
         │
    ┌────▼─────┐      ┌──────────────┐      ┌──────────────┐
    │ innings  │─────►│  deliveries  │─────►│ delivery_edits│
    └────┬─────┘      └──────────────┘      └──────────────┘
         │
    ┌────▼──────────────┐
    │ innings_intervals │  (drinks, rain, powerplay boundaries)
    └───────────────────┘

  ┌──────────────────┐   ┌──────────────────┐   ┌─────────────────┐
  │ player_career_   │   │ ranking_snapshots│   │   audit_log     │
  │     stats (MV)   │   └──────────────────┘   └─────────────────┘
  └──────────────────┘
```

---

## 2. Identity & people

### `profiles`
Mirrors `auth.users`. Created by trigger on signup.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `display_name` | text not null | |
| `handle` | citext unique | `@rachit` — used for invites |
| `avatar_url` | text | Supabase Storage |
| `email` | citext | |
| `phone` | text | |
| `is_super_admin` | boolean default false | **The god flag.** |
| `theme_pref` | text default 'system' | `dark` \| `light` \| `system` |
| `accent_pref` | text default 'cyan' | see design system |
| `haptics_enabled` | boolean default true | |
| `sound_enabled` | boolean default false | |
| `scorer_hand` | text default 'right' | `left` \| `right` — mirrors the pad |
| `reduced_motion_override` | boolean | null = follow OS |
| `last_seen_at` | timestamptz | |

### `players`
The cricketing identity. **Separable from a login** so a Team Admin can add a
teammate who has never opened the app.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid FK → profiles null | null = **shadow player** |
| `full_name` | text not null | |
| `short_name` | text | "R. Sharma" — used on the scoreboard |
| `jersey_number` | int | |
| `date_of_birth` | date | |
| `photo_url` | text | |
| `primary_role` | player_role not null default 'batter' | **player-controlled** |
| `secondary_role` | player_role | |
| `batting_hand` | batting_hand default 'right' | **player-controlled** |
| `bowling_style` | bowling_style | **player-controlled** |
| `bio` | text | |
| `role_locked_by_admin` | boolean default false | Super Admin can freeze a role in a dispute |
| `created_by` | uuid FK → profiles | who added this player |
| `claim_code` | text unique | short code a shadow player uses to claim themselves |
| `claimed_at` | timestamptz | |

**Enums**

```sql
create type player_role as enum
  ('batter','bowler','all_rounder','wicket_keeper','wk_batter');

create type batting_hand as enum ('right','left');

create type bowling_style as enum (
  'right_arm_fast','right_arm_fast_medium','right_arm_medium',
  'right_arm_off_break','right_arm_leg_break',
  'left_arm_fast','left_arm_fast_medium','left_arm_medium',
  'left_arm_orthodox','left_arm_chinaman','none'
);
```

> **Rule:** `primary_role`, `secondary_role`, `batting_hand`, `bowling_style`
> are writable by the linked `profile_id` **or** a Super Admin — never by a Team
> Admin. Enforced by RLS. See [03-ROLES-PERMISSIONS](./03-ROLES-PERMISSIONS.md).

### `role_change_suggestions`
Lets a Team Admin propose a role without being able to set it.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `player_id` | uuid FK → players |
| `suggested_by` | uuid FK → profiles |
| `suggested_role` | player_role |
| `note` | text |
| `status` | text — `pending` \| `accepted` \| `rejected` |
| `resolved_at` | timestamptz |

---

## 3. Teams

### `teams`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text not null | |
| `short_code` | text not null | 3 chars, e.g. `MUM` |
| `slug` | text unique | url |
| `logo_url` | text | |
| `primary_color` | text default '#06b6d4' | hex — drives live UI tint |
| `secondary_color` | text | |
| `home_ground` | text | |
| `city` | text | |
| `founded_year` | int | |
| `owner_id` | uuid FK → profiles not null | the creating Team Admin |
| `is_archived` | boolean default false | |

### `team_members`
Join table. A player may be in many teams.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `team_id` | uuid FK → teams | |
| `player_id` | uuid FK → players | |
| `team_role` | team_role default 'player' | `owner`\|`admin`\|`captain`\|`vice_captain`\|`player` |
| `squad_number` | int | |
| `joined_at` | timestamptz | |
| `left_at` | timestamptz | null = current |
| `is_active` | boolean generated: `left_at is null` | |

Unique index on `(team_id, player_id)` where `left_at is null`.

```sql
create type team_role as enum
  ('owner','admin','captain','vice_captain','player');
```

---

## 4. Matches

### `matches`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `public_slug` | text unique | shareable audience link, e.g. `mum-vs-che-8f3a` |
| `title` | text | optional, "Final" |
| `tournament_id` | uuid FK → tournaments null | v1.1 |
| `team_a_id` | uuid FK → teams | |
| `team_b_id` | uuid FK → teams | |
| `venue` | text | |
| `scheduled_at` | timestamptz | |
| `status` | match_status default 'scheduled' | |
| `config` | jsonb not null | **the full rules config — see §4.1** |
| `toss_winner_team_id` | uuid FK → teams | |
| `toss_decision` | text | `bat` \| `bowl` |
| `current_innings_no` | int default 0 | 0 until first ball |
| `result_type` | result_type | |
| `winner_team_id` | uuid FK → teams | |
| `win_margin_runs` | int | |
| `win_margin_wickets` | int | |
| `player_of_match_id` | uuid FK → players | |
| `result_text` | text | "MUM won by 24 runs" |
| `created_by` | uuid FK → profiles | |
| `completed_at` | timestamptz | |
| `is_locked` | boolean default false | true once completed; only Super Admin unlocks |

```sql
create type match_status as enum
  ('scheduled','toss','live','innings_break','super_over','completed','abandoned');

create type result_type as enum
  ('win','tie','draw','no_result','abandoned','super_over_win','forfeit');
```

#### 4.1 `matches.config` JSON shape

This is the **settings block**. Overs per innings lives here.

```jsonc
{
  "oversPerInnings": 20,          // ← configurable, 1–90
  "ballsPerOver": 6,              // configurable, supports 8-ball novelty formats
  "playersPerSide": 11,           // 5–15
  "maxOversPerBowler": 4,         // null = oversPerInnings/5 auto, or explicit
  "wideRuns": 1,
  "noBallRuns": 1,
  "byesEnabled": true,
  "legByesEnabled": true,
  "freeHitAfterNoBall": true,
  "lastManStanding": false,       // single batter can continue alone
  "powerplays": [
    { "name": "PP1", "fromOver": 1, "toOver": 6, "fieldersOutside": 2 }
  ],
  "superOverOnTie": true,
  "followOnEnabled": false,       // multi-day only
  "declarationsEnabled": false,
  "retiredHurtCanReturn": true,
  "noBallFreeHitOnAllNoBalls": true,
  "penaltyRunsEnabled": true,
  "drsEnabled": false,
  "rulesProfileName": "T20 Standard"
}
```

A named preset is stored in `rules_profiles` and copied into `matches.config`
at creation. **Copied, not referenced** — so editing a profile never rewrites
the history of a played match.

### `rules_profiles`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `name` | text unique |
| `config` | jsonb |
| `is_system` | boolean — built-ins: T20, ODI, T10, Gully 8, The Hundred |
| `created_by` | uuid FK → profiles |

### `match_squads`
Who is playing, for each team, in this match.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `match_id` | uuid FK → matches | |
| `team_id` | uuid FK → teams | |
| `player_id` | uuid FK → players | |
| `is_playing_xi` | boolean default true | false = bench/impact sub |
| `is_captain` | boolean default false | |
| `is_wicket_keeper` | boolean default false | |
| `batting_order` | int | nullable; set/adjusted live |
| `role_in_match` | player_role | snapshot of role at match time |

Unique `(match_id, player_id)`.

---

## 5. Scoring rights

### `scoring_grants`
**The token.** Append-mostly; revocation is a status change, never a delete.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `match_id` | uuid FK → matches not null | |
| `grantee_profile_id` | uuid FK → profiles not null | who holds it |
| `granted_by_profile_id` | uuid FK → profiles not null | who issued it |
| `status` | grant_status default 'active' | |
| `can_delegate` | boolean default false | may this holder issue further grants |
| `scope` | text default 'full' | `full` \| `innings_1` \| `innings_2` \| `commentary_only` |
| `granted_at` | timestamptz default now() | |
| `expires_at` | timestamptz | null = until match ends |
| `revoked_at` | timestamptz | |
| `revoked_by_profile_id` | uuid FK → profiles | |
| `transferred_to_grant_id` | uuid FK → scoring_grants | set when passed on |
| `note` | text | |

```sql
create type grant_status as enum ('active','revoked','expired','transferred');
```

Partial unique index prevents duplicate active grants:
```sql
create unique index one_active_grant_per_user_per_match
  on scoring_grants (match_id, grantee_profile_id)
  where status = 'active';
```

Helper function used everywhere in RLS:
```sql
create or replace function public.can_score(p_match_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles p
     where p.id = p_profile_id and p.is_super_admin
  ) or exists (
    select 1 from scoring_grants g
     where g.match_id = p_match_id
       and g.grantee_profile_id = p_profile_id
       and g.status = 'active'
       and (g.expires_at is null or g.expires_at > now())
  );
$$;
```

---

## 6. The match log

### `innings`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `match_id` | uuid FK → matches | |
| `innings_no` | int not null | 1, 2, (3,4 for super over) |
| `batting_team_id` | uuid FK → teams | |
| `bowling_team_id` | uuid FK → teams | |
| `is_super_over` | boolean default false | |
| `total_runs` | int default 0 | denormalised, maintained by trigger |
| `total_wickets` | int default 0 | " |
| `legal_balls` | int default 0 | " |
| `extras_wides` | int default 0 | " |
| `extras_no_balls` | int default 0 | " |
| `extras_byes` | int default 0 | " |
| `extras_leg_byes` | int default 0 | " |
| `extras_penalty` | int default 0 | " |
| `target` | int | for the chasing innings |
| `revised_target` | int | manual rain adjustment |
| `revised_overs` | numeric(4,1) | |
| `status` | text default 'in_progress' | `in_progress`\|`completed`\|`declared`\|`abandoned` |
| `end_reason` | text | `all_out`\|`overs_complete`\|`target_reached`\|`declared`\|`abandoned` |
| `started_at` / `ended_at` | timestamptz | |

Unique `(match_id, innings_no)`.

### `deliveries`
**The single source of truth for everything.** Append-only. Every stat, chart,
and ranking is derived from this table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `innings_id` | uuid FK → innings not null | |
| `match_id` | uuid FK → matches not null | denormalised for query speed |
| `seq` | bigint not null | **server-assigned monotonic sequence per innings** |
| `over_no` | int not null | 0-indexed over |
| `ball_in_over` | int not null | 1..ballsPerOver for legal balls; illegal balls repeat |
| `is_legal` | boolean not null | false for wide / no-ball |
| `striker_id` | uuid FK → players not null | |
| `non_striker_id` | uuid FK → players not null | |
| `bowler_id` | uuid FK → players not null | |
| `runs_batter` | int default 0 | credited to the batter |
| `runs_extras` | int default 0 | total extras on this ball |
| `extra_type` | extra_type | null if none |
| `runs_total` | int generated always as (runs_batter + runs_extras) stored | |
| `is_wicket` | boolean default false | |
| `wicket_type` | wicket_type | |
| `dismissed_player_id` | uuid FK → players | may be the non-striker (run out) |
| `fielder_id` | uuid FK → players | catcher / thrower / stumper |
| `assist_fielder_id` | uuid FK → players | relay throw |
| `is_free_hit` | boolean default false | this ball *was* a free hit |
| `creates_free_hit` | boolean default false | next ball is a free hit |
| `is_boundary_four` | boolean default false | |
| `is_boundary_six` | boolean default false | |
| `shot_x` / `shot_y` | numeric | optional wagon-wheel coords, −1..1 |
| `pitch_x` / `pitch_y` | numeric | optional pitch map coords |
| `commentary` | text | auto-generated, scorer-editable |
| `scored_by_profile_id` | uuid FK → profiles not null | **which token holder entered it** |
| `client_delivery_id` | uuid not null | client-generated idempotency key for offline sync |
| `is_deleted` | boolean default false | soft delete via undo |
| `created_at` | timestamptz | |

```sql
create type extra_type as enum
  ('wide','no_ball','bye','leg_bye','penalty');

create type wicket_type as enum
  ('bowled','caught','lbw','run_out','stumped','hit_wicket',
   'retired_out','retired_hurt','obstructing_the_field',
   'handled_the_ball','timed_out','hit_ball_twice');
```

Indexes:
```sql
create unique index on deliveries (innings_id, seq);
create unique index on deliveries (client_delivery_id);
create index on deliveries (match_id, over_no, ball_in_over);
create index on deliveries (striker_id) where is_deleted = false;
create index on deliveries (bowler_id) where is_deleted = false;
create index on deliveries (dismissed_player_id) where is_wicket;
```

### `delivery_edits`
Full audit trail. Nothing in a match log is ever silently changed.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `delivery_id` | uuid FK → deliveries |
| `edited_by_profile_id` | uuid FK → profiles |
| `edit_type` | text — `correct` \| `undo` \| `restore` |
| `before` | jsonb — full row snapshot |
| `after` | jsonb |
| `reason` | text |
| `created_at` | timestamptz |

### `innings_intervals`
Rain, drinks, injury stoppage, powerplay markers.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `innings_id` | uuid FK → innings |
| `type` | text — `drinks`\|`rain`\|`injury`\|`powerplay_start`\|`powerplay_end`\|`strategic_timeout` |
| `at_over` | numeric(4,1) |
| `overs_lost` | numeric(4,1) |
| `started_at` / `ended_at` | timestamptz |
| `note` | text |

### `batting_card_entries`
Derived, but persisted for fast scorecard reads and to record *how* a batter
came and went (order, retired, did-not-bat).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `innings_id` | uuid FK → innings | |
| `player_id` | uuid FK → players | |
| `position` | int | 1..N |
| `runs` / `balls` / `fours` / `sixes` | int | maintained by trigger |
| `status` | text | `not_out`\|`out`\|`retired_hurt`\|`retired_out`\|`did_not_bat` |
| `dismissal_delivery_id` | uuid FK → deliveries | |
| `dismissal_text` | text | "c Kohli b Bumrah" |
| `minutes_at_crease` | int | |

### `bowling_card_entries`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `innings_id` | uuid FK → innings |
| `player_id` | uuid FK → players |
| `overs_legal_balls` | int |
| `maidens` / `runs_conceded` / `wickets` | int |
| `wides` / `no_balls` / `dots` | int |
| `fours_conceded` / `sixes_conceded` | int |

---

## 7. Stats & rankings

### `player_match_stats`
One row per player per match. Written when the match is completed (and
recomputable at any time from `deliveries`).

| Column | Type |
|---|---|
| `id` | uuid PK |
| `match_id` / `player_id` / `team_id` | uuid FK |
| `did_bat` / `did_bowl` | boolean |
| `runs` `balls_faced` `fours` `sixes` `is_out` `is_not_out` | int/bool |
| `strike_rate` | numeric(6,2) |
| `balls_bowled` `runs_conceded` `wickets` `maidens` `dots` | int |
| `economy` | numeric(5,2) |
| `catches` `run_outs` `stumpings` | int |
| `is_player_of_match` | boolean |
| `match_result_for_player` | text — `won`\|`lost`\|`tie`\|`nr` |
| `rating_points` | numeric(7,2) — this match's contribution to rank |

### `player_career_stats` — PLAIN TABLE
Aggregates `player_match_stats`. **Fully rewritten** by the
`recompute_rankings` edge function on match completion and nightly. Columns:
matches, innings, runs, HS, average, SR, 50s, 100s, ducks, balls, wickets, BBI,
bowling avg, economy, 3wi/5wi, catches, stumpings, run-outs, and the composite
rating fields defined in [07-STATS-AND-RANKINGS](./07-STATS-AND-RANKINGS.md).

> Originally specced as a materialized view. Changed to a plain table: at 320
> players and ~25k deliveries a full recompute is a sub-second query, and MV
> refreshes take locks that are unpleasant on a shared free-tier instance.
> See [14-FREE-TIER-PLAN](./14-FREE-TIER-PLAN.md) § 4.4.

### `ranking_snapshots`
Historical rankings so a player can see "you climbed 4 places this week".

| Column | Type |
|---|---|
| `id` | uuid PK |
| `player_id` | uuid FK |
| `scope` | text — `global` or `team:<uuid>` |
| `board` | text — `overall`\|`batting`\|`bowling`\|`allrounder`\|`fielding` |
| `rank` | int |
| `rating` | numeric(7,2) |
| `snapshot_date` | date |

Unique `(player_id, scope, board, snapshot_date)`.

---

## 8. Cross-cutting

### `audit_log`
Everything privileged: grants issued/revoked, roles changed, matches unlocked,
players deleted, config edited mid-match.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `actor_profile_id` | uuid FK → profiles |
| `action` | text |
| `entity_type` / `entity_id` | text / uuid |
| `before` / `after` | jsonb |
| `ip` / `user_agent` | text |
| `created_at` | timestamptz |

### `app_settings`
Single-row table, Super Admin only.

| Column | Type |
|---|---|
| `id` | int PK check (id = 1) |
| `app_name` | text |
| `default_rules_profile_id` | uuid FK |
| `default_overs` | int default 20 |
| `allow_public_audience` | boolean default true |
| `allow_self_signup` | boolean default true |
| `branding` | jsonb |

### `notifications`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `profile_id` | uuid FK |
| `type` | text — `grant_issued`\|`grant_revoked`\|`match_starting`\|`role_suggestion`\|`rank_change` |
| `payload` | jsonb |
| `read_at` | timestamptz |

---

## 9. Data integrity rules

1. **`deliveries` is append-only.** Undo sets `is_deleted = true` and writes a
   `delivery_edits` row. Physical deletes are blocked by a `BEFORE DELETE` trigger.
2. **`seq` is assigned server-side** by a Postgres sequence per innings, so two
   co-scorers cannot collide.
3. **Denormalised innings totals** are maintained by an `AFTER INSERT/UPDATE`
   trigger on `deliveries`, and can be fully rebuilt with
   `select rebuild_innings(innings_id)`.
4. **Completed matches are immutable.** `matches.is_locked = true` blocks all
   writes to child rows via RLS. Only a Super Admin can unlock, and the unlock
   is audit-logged.
5. **A player's role columns** are writable only by the owning profile or a
   Super Admin.
6. **Idempotent sync**: `client_delivery_id` is unique, so replaying a queued
   offline ball is a no-op.
