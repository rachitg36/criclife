# 03 — Roles, Permissions & the Scoring Token

This is the trickiest part of the product. Read it carefully before writing any
policy code.

---

## 1. Two orthogonal axes

Permissions in CricLife come from **two independent systems** that are
deliberately not merged:

| Axis | Where it lives | Lifetime | Example |
|---|---|---|---|
| **Identity roles** | `profiles.is_super_admin`, `team_members.team_role` | Long-lived | "Priya is admin of Mumbai Strikers" |
| **Scoring grants** | `scoring_grants` | Per match, revocable in seconds | "Arjun can score today's match" |

A Team Admin does **not** automatically get to score. A random spectator with a
grant **does**. This separation is what makes "pass the token to whoever is free"
work naturally.

---

## 2. Identity roles

### 2.1 Super Admin (`profiles.is_super_admin = true`)

Can do **everything**, everywhere, always:

- Create/edit/delete any team, player, match.
- Issue and revoke any scoring grant, override any holder.
- Edit any delivery in any match, including completed ones.
- **Unlock a completed match** (audit-logged, shows a banner on the scorecard:
  "This match was amended by an administrator on <date>").
- Change any player's role, even when `role_locked_by_admin` is set.
- Merge duplicate players, claim/unclaim shadow players.
- Force-recompute stats and rankings.
- Read the full `audit_log`.
- Grant or revoke Super Admin from another profile (at least one must always exist).

Implementation: every RLS policy is written as
`is_super_admin() OR (<normal condition>)`.

```sql
create or replace function public.is_super_admin()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select is_super_admin from profiles where id = auth.uid()), false);
$$;
```

### 2.2 Team roles (`team_members.team_role`)

| Role | Can |
|---|---|
| `owner` | Everything for that team, including deleting it and transferring ownership |
| `admin` | Add/remove players, create matches for the team, pick the squad, issue scoring grants for the team's matches |
| `captain` | Pick the squad, set batting order, issue scoring grants |
| `vice_captain` | Same as captain |
| `player` | View team, view own stats, edit **own** player profile |

### 2.3 Player self-ownership

> **Requirement:** "Players should have permissions to update their own roles,
> like batsman or all-rounder or whatever."

A player controls these fields on **their own** `players` row:

- `primary_role`, `secondary_role`
- `batting_hand`, `bowling_style`
- `short_name`, `photo_url`, `bio`, `jersey_number`, `date_of_birth`

Nobody else can — not even a Team Admin. A Team Admin who thinks the role is
wrong files a **role change suggestion** (`role_change_suggestions`), which the
player sees as a notification and accepts or rejects with one tap.

Escape hatch: a Super Admin can set `role_locked_by_admin = true` (e.g. a
tournament requires verified all-rounder status), after which only a Super Admin
can change it. The player sees a lock icon and the reason.

**Shadow players** (no `profile_id`) have their role set by whoever created them,
until the player claims the record via `claim_code`. On claim, ownership
transfers to the claiming profile and a notification is sent to the team admin.

---

## 3. The Scoring Token

> **Requirement:** "Someone should have a map that should allow somebody to have
> the scoring rights. The scoring right token can be passed on to someone else or
> to multiple people as well."

### 3.1 Concept

A **scoring grant** is a row in `scoring_grants` that says:

> *profile X may record deliveries in match M, until revoked.*

Key properties:

- **Multi-holder.** Any number of grants can be active for one match at once.
  Two scorers on opposite sides of the ground, or a primary + a backup.
- **Transferable.** A holder can pass their grant to another user. This
  atomically marks theirs `transferred` and creates a new `active` grant.
- **Revocable.** Instantly, by the match owner, either team's admin/captain, the
  issuer, or a Super Admin.
- **Delegable (optional).** `can_delegate = true` lets a holder issue further
  grants. Off by default — prevents an unbounded chain.
- **Scoped (optional).** `scope` limits a grant to one innings, or to
  `commentary_only` (can write commentary text but not runs/wickets).
- **Expiring (optional).** `expires_at` for "you can score for the next 2 hours".

### 3.2 Who can issue a grant

| Issuer | Condition |
|---|---|
| Super Admin | always |
| `matches.created_by` | always for that match |
| Team `owner` / `admin` / `captain` / `vice_captain` of either team | for that match |
| An existing grant holder | only if their grant has `can_delegate = true` |

### 3.3 Lifecycle state machine

```
                    issue
      (nobody) ───────────────► active
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
         revoke                transfer              expire
            │                     │                     │
            ▼                     ▼                     ▼
         revoked            transferred            expired
                                  │
                                  └──► (new active grant for new holder)
```

Terminal states are never reverted — re-granting creates a **new row**. This
keeps a perfect history of who held scoring rights at every moment, which
matters when a score is disputed.

### 3.4 The "Scoring Map" screen

> The user asked for "a map that should allow somebody to have the scoring rights."

We interpret this as a **Scoring Rights Map** — a single visual screen showing
the live topology of who can score right now. This is a signature screen, not a
settings list.

**Layout (mobile, full-screen):**

```
┌──────────────────────────────────────┐
│  SCORING RIGHTS            [match ▾] │
├──────────────────────────────────────┤
│                                      │
│              ╭────────╮              │
│              │  MATCH │              │  ← centre node, pulsing
│              │  OWNER │              │
│              ╰───┬────╯              │
│         ┌────────┼────────┐          │
│         │        │        │          │  ← animated edges, glow = active
│      ╭──▼──╮ ╭───▼──╮ ╭───▼──╮       │
│      │Arjun│ │Priya │ │ Dev  │       │
│      │ ●   │ │ ●    │ │ ○    │       │  ● active  ○ revoked
│      │LIVE │ │backup│ │ 2:14 │       │
│      ╰──┬──╯ ╰──────╯ ╰──────╯       │
│         │                            │
│      ╭──▼──╮                         │  ← delegated chain
│      │Sara │  (via Arjun)            │
│      ╰─────╯                         │
├──────────────────────────────────────┤
│ [ + Give scoring rights ]            │
│ Tap a node → Pass / Revoke / Scope   │
└──────────────────────────────────────┘
```

Behaviour:

- Force-directed / radial graph rendered in SVG with `motion` springs.
- Edges animate a travelling dot from issuer → holder while a grant is active.
- The node of whoever entered the **most recent ball** briefly flares.
- Tap a node → bottom sheet: `Pass to…`, `Revoke`, `Allow delegation`,
  `Limit scope`, `Set expiry`, `View their entries`.
- Long-press the centre → `Revoke all`.
- Live-updates over Supabase Realtime, so everyone watching the map sees a
  revocation the instant it happens.
- Also available as a plain accessible list (toggle top-right) for screen readers.

### 3.5 Handing over mid-match

Two flows, both designed for the reality of someone needing to bat:

1. **Pass** — the current scorer taps `Pass to…`, picks a person, confirms.
   Their own grant becomes `transferred`. The new holder gets a push notification
   and their scorer view unlocks at the exact current ball.
2. **Handoff QR** — the scorer shows a QR code; the next person scans it with
   their phone camera and instantly receives a grant. No typing at a noisy ground.

An outgoing scorer can choose **"keep my rights too"** — then it's an *issue*,
not a *transfer*, and both hold grants.

### 3.6 Concurrent scoring conflict resolution

When multiple people hold grants, two can tap at once. Rules:

1. `deliveries.seq` comes from a Postgres sequence — the server decides order.
2. The client sends `expected_seq`. If it doesn't match, the server rejects with
   `409 STALE_STATE` and the client refetches and shows: *"Priya just recorded
   this ball."* The duplicate entry is discarded, not double-counted.
3. A **soft lock** is broadcast on the realtime channel: when a scorer opens the
   wicket sheet, other scorers see *"Arjun is entering a wicket…"* and their
   pad dims for 8s.
4. `client_delivery_id` uniqueness makes retries idempotent.
5. Every delivery stores `scored_by_profile_id`, so the scorecard can show who
   entered any given ball.

---

## 4. Full permission matrix

Legend: ✅ allowed · ⚠️ allowed with conditions · ❌ denied

| Action | Super Admin | Team Owner/Admin | Captain / VC | Grant holder | Player (self) | Audience |
|---|---|---|---|---|---|---|
| Create team | ✅ | ✅ (own new team) | ❌ | ❌ | ✅ | ❌ |
| Edit team details | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete/archive team | ✅ | ⚠️ owner only | ❌ | ❌ | ❌ | ❌ |
| Add player to team | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Remove player from team | ✅ | ✅ | ❌ | ❌ | ⚠️ leave self | ❌ |
| Create shadow player | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Set player's playing role** | ✅ | ❌ | ❌ | ❌ | **✅ own only** | ❌ |
| Suggest a role change | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Lock a player's role | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create match | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit match config (pre-toss) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit match config (live) | ✅ | ⚠️ audit-logged | ❌ | ❌ | ❌ | ❌ |
| Select playing squad | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Record toss | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Record a delivery** | ✅ | ❌ | ❌ | **✅** | ❌ | ❌ |
| Undo last delivery | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Edit an earlier delivery | ✅ | ❌ | ❌ | ⚠️ same innings, audit-logged | ❌ | ❌ |
| Edit a *completed* match | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Issue scoring grant | ✅ | ✅ | ✅ | ⚠️ if `can_delegate` | ❌ | ❌ |
| Revoke scoring grant | ✅ | ✅ | ✅ | ⚠️ own only | ❌ | ❌ |
| Transfer own grant | ✅ | — | — | ✅ | ❌ | ❌ |
| View Scoring Rights Map | ✅ | ✅ | ✅ | ✅ | ⚠️ read-only if in squad | ❌ |
| View live audience score | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View completed scorecard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View any player's stats | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View ranks page | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit app settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Read audit log | ✅ | ⚠️ own team scope | ❌ | ❌ | ❌ | ❌ |
| Recompute stats/rankings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 5. Row Level Security policy sketches

Enable RLS on **every** table. Deny by default.

### Helper functions

```sql
-- is the current user an admin-ish member of this team?
create or replace function public.is_team_manager(p_team_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
      from team_members tm
      join players pl on pl.id = tm.player_id
     where tm.team_id = p_team_id
       and pl.profile_id = auth.uid()
       and tm.left_at is null
       and tm.team_role in ('owner','admin','captain','vice_captain')
  );
$$;

-- does the current user manage either team in this match, or own it?
create or replace function public.can_manage_match(p_match_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from matches m
     where m.id = p_match_id
       and ( m.created_by = auth.uid()
          or public.is_team_manager(m.team_a_id)
          or public.is_team_manager(m.team_b_id) )
  );
$$;
```

### `players` — the self-role rule

```sql
alter table players enable row level security;

create policy players_read_all on players
  for select using (true);

create policy players_insert_by_managers on players
  for insert with check (
    public.is_super_admin() or auth.uid() is not null
  );

-- Self can update everything about themselves EXCEPT the lock flag.
create policy players_update_self on players
  for update
  using (
    profile_id = auth.uid() and role_locked_by_admin = false
  )
  with check (
    profile_id = auth.uid() and role_locked_by_admin = false
  );

create policy players_update_superadmin on players
  for update using (public.is_super_admin())
  with check (public.is_super_admin());
```

Team managers get a **column-limited** update path via a `security definer`
RPC (`update_player_admin_fields`) that touches only `full_name`,
`jersey_number`, `squad_number` — never the role columns. This is cleaner than
column-level grants and keeps the rule visible in one place.

### `deliveries` — the token rule

```sql
alter table deliveries enable row level security;

create policy deliveries_read_public on deliveries
  for select using (true);   -- audience view needs this

create policy deliveries_insert_by_grant on deliveries
  for insert with check (
    public.can_score(match_id, auth.uid())
    and scored_by_profile_id = auth.uid()
    and not exists (
      select 1 from matches m where m.id = match_id and m.is_locked
    )
  );

create policy deliveries_update_by_grant on deliveries
  for update using (
    public.is_super_admin()
    or ( public.can_score(match_id, auth.uid())
         and not exists (select 1 from matches m
                          where m.id = match_id and m.is_locked) )
  );

-- physical deletes are never allowed
create policy deliveries_no_delete on deliveries for delete using (false);
```

### `scoring_grants`

```sql
create policy grants_read on scoring_grants
  for select using (
    public.is_super_admin()
    or public.can_manage_match(match_id)
    or grantee_profile_id = auth.uid()
  );

create policy grants_issue on scoring_grants
  for insert with check (
    granted_by_profile_id = auth.uid()
    and (
      public.is_super_admin()
      or public.can_manage_match(match_id)
      or exists (
        select 1 from scoring_grants g
         where g.match_id = scoring_grants.match_id
           and g.grantee_profile_id = auth.uid()
           and g.status = 'active'
           and g.can_delegate
      )
    )
  );

create policy grants_revoke on scoring_grants
  for update using (
    public.is_super_admin()
    or public.can_manage_match(match_id)
    or granted_by_profile_id = auth.uid()
    or grantee_profile_id = auth.uid()   -- may revoke/transfer own
  );
```

### `matches`

```sql
create policy matches_read_public on matches for select using (true);

create policy matches_write on matches for all
  using (public.is_super_admin() or public.can_manage_match(id))
  with check (public.is_super_admin() or public.can_manage_match(id));

-- lock enforcement lives in a BEFORE UPDATE trigger:
--   if OLD.is_locked and not is_super_admin() then raise exception
```

---

## 6. Anonymous audience access

The audience view must work with **no login**.

- `matches`, `innings`, `deliveries`, `teams`, `players`, `batting_card_entries`,
  `bowling_card_entries` all have `for select using (true)` — readable by the
  `anon` role.
- Nothing sensitive lives in those tables. Emails and phone numbers are in
  `profiles`, which is **not** publicly readable.
- Access is by `matches.public_slug`, an unguessable suffix.
- `app_settings.allow_public_audience = false` flips these to
  `using (auth.uid() is not null)` for private leagues.
- Rate limiting on the realtime channel: anon subscribers get read-only
  `postgres_changes`, never `broadcast` send rights.

---

## 7. Security checklist before launch

- [ ] RLS enabled on **every** table; verified with a `pgTAP` test suite that
      runs as `anon`, as a plain player, as a team admin, and as a grant holder.
- [ ] No table exposes `profiles.email` / `phone` to `anon`.
- [ ] `service_role` key never reaches the client bundle (CI check on `dist/`).
- [ ] Every `security definer` function has `set search_path = public`.
- [ ] `can_score` is the *only* path to writing a delivery.
- [ ] Completed-match immutability tested.
- [ ] Grant revocation propagates to an open scorer view within 2s (realtime
      subscription flips the pad to a read-only "Your scoring rights were
      revoked" state).
- [ ] Offline queue refuses to sync if the grant was revoked while offline —
      queued balls go to a "rejected, review" tray rather than being lost or
      silently applied.
