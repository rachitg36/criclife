# 10 — API Contract

Most reads go directly through **PostgREST** (Supabase's auto-generated REST
layer) with RLS doing the authorization. Anything that must be atomic or must
enforce a rule the database can't express in a policy goes through a
**Postgres RPC** (`security definer` function).

Rule of thumb: **reads = PostgREST, writes that matter = RPC.**

---

## 1. Authentication

| Endpoint | Notes |
|---|---|
| `supabase.auth.signInWithOtp({ email })` | magic link, primary |
| `supabase.auth.signInWithOtp({ phone })` | SMS OTP |
| `supabase.auth.signInWithOAuth({ provider: 'google' })` | |
| `supabase.auth.signOut()` | |

On first sign-in a trigger creates a `profiles` row. Onboarding then asks:
*"Are you a player?"* → optionally creates or claims a `players` row.

---

## 2. Reads (PostgREST)

```ts
// Teams the user belongs to
supabase.from('teams')
  .select('*, team_members!inner(player_id, team_role)')
  .eq('team_members.player_id', playerId)
  .is('team_members.left_at', null);

// Full squad
supabase.from('team_members')
  .select('*, player:players(*)')
  .eq('team_id', teamId).is('left_at', null)
  .order('squad_number');

// Match hub
supabase.from('matches')
  .select(`*,
    team_a:teams!matches_team_a_id_fkey(*),
    team_b:teams!matches_team_b_id_fkey(*),
    innings(*),
    match_squads(*, player:players(*))`)
  .eq('id', matchId).single();

// Delivery log (paginate for long innings)
supabase.from('deliveries')
  .select('*')
  .eq('innings_id', inningsId).eq('is_deleted', false)
  .order('seq').range(from, to);

// Active grants
supabase.from('scoring_grants')
  .select('*, grantee:profiles!grantee_profile_id(id,display_name,avatar_url), granted_by:profiles!granted_by_profile_id(id,display_name)')
  .eq('match_id', matchId).eq('status', 'active');

// Audience view by public slug (works unauthenticated)
supabase.from('matches').select(...).eq('public_slug', slug).single();
```

---

## 3. RPCs — the write surface

### 3.1 `record_delivery`

The most important endpoint in the app.

```sql
create or replace function record_delivery(p jsonb)
returns jsonb language plpgsql security definer as $$ ... $$;
```

**Request**
```jsonc
{
  "clientDeliveryId": "9f2a…",     // idempotency key
  "inningsId": "…",
  "expectedSeq": 87,               // client's view of the last seq
  "strikerId": "…",
  "nonStrikerId": "…",
  "bowlerId": "…",
  "runsOffBat": 4,
  "extraType": null,
  "extraRuns": 0,
  "isBoundary": true,
  "isFreeHit": false,
  "wicket": null,
  "shot": { "x": 0.42, "y": -0.71 },
  "commentaryOverride": null
}
```

**Response 200**
```jsonc
{
  "ok": true,
  "delivery": { "id": "…", "seq": 88, "overNo": 14, "ballInOver": 4, ... },
  "innings": { "runs": 151, "wickets": 4, "legalBalls": 88 },
  "events": ["BOUNDARY_FOUR", "FIFTY_MILESTONE"]
}
```

**Errors**
| Code | Meaning | Client action |
|---|---|---|
| `NO_GRANT` 403 | caller holds no active grant | lock the pad, show a message |
| `MATCH_LOCKED` 403 | match completed | read-only |
| `STALE_SEQ` 409 | someone else scored first | refetch, replay, show "Priya recorded a ball" |
| `DUPLICATE` 200 | `clientDeliveryId` already exists | treat as success, return the existing row |
| `ILLEGAL_DISMISSAL` 422 | e.g. bowled on a free hit | show the reason inline |
| `INNINGS_COMPLETE` 422 | innings already ended | refetch |
| `BOWLER_LIMIT` 422 | over the per-bowler cap | reopen the bowler picker |
| `CONSECUTIVE_OVER` 422 | same bowler two overs running | reopen the bowler picker |

Server-side, the function re-validates the ball against the engine's rules
(ported to PL/pgSQL for the critical subset: legality, seq, grants, limits).
**The client engine is for speed; the server is for truth.**

### 3.2 `record_deliveries_batch`
Same as above but takes an array. Used by the offline sync worker. Processes in
order, stops at the first hard error, returns per-item results so partial
success is representable.

### 3.3 `undo_last_delivery`
```jsonc
{ "inningsId": "…", "reason": "mis-tap" }
→ { "ok": true, "undoneDeliveryId": "…", "innings": {...} }
```
Soft-deletes, writes `delivery_edits`, rebuilds innings totals.

### 3.4 `edit_delivery`
```jsonc
{ "deliveryId": "…", "changes": { ...DeliveryInput }, "reason": "was a leg bye" }
```
Soft-deletes the old row, inserts a corrected one at the same `seq`, audits,
rebuilds. Requires an active grant (same innings) or Super Admin.

### 3.5 Grant management

```
issue_scoring_grant   { matchId, granteeProfileId, canDelegate?, scope?, expiresAt?, note? }
                      → { grant }

revoke_scoring_grant  { grantId, reason? }
                      → { ok }

transfer_scoring_grant { grantId, toProfileId, keepMine? }
                      → { oldGrant, newGrant }
                      // keepMine=true → issue instead of transfer

create_handoff_token  { matchId, ttlSeconds: 300 }
                      → { token, qrPayload }

redeem_handoff_token  { token }
                      → { grant }
```

All five write to `audit_log` and broadcast on the match realtime channel so
the Scoring Rights Map and every open pad update within ~1s.

### 3.6 Match lifecycle

```
create_match          { teamAId, teamBId, venue, scheduledAt, config }
                      → { match }   // also creates public_slug + owner grant

set_toss              { matchId, winnerTeamId, decision }
set_playing_xi        { matchId, teamId, playerIds[], captainId, keeperId }
start_innings         { matchId, inningsNo, strikerId, nonStrikerId, bowlerId }
end_innings           { inningsId, reason }
complete_match        { matchId, playerOfMatchId? }   → triggers finalize_match
abandon_match         { matchId, reason }
start_super_over      { matchId }
unlock_match          { matchId, reason }             // SUPER ADMIN ONLY
set_revised_target    { inningsId, target, overs, reason }
add_interval          { inningsId, type, atOver, oversLost? }
```

### 3.7 Players & roles

```
create_shadow_player      { fullName, teamId, ... }        → { player, claimCode }
claim_player              { claimCode }                    → { player }
update_own_player_profile { playerId, primaryRole?, secondaryRole?,
                            battingHand?, bowlingStyle?, shortName?, bio? }
                          // RLS: profile_id must = auth.uid()
update_player_admin_fields{ playerId, fullName?, jerseyNumber?, squadNumber? }
                          // team managers; CANNOT touch role columns
suggest_role_change       { playerId, suggestedRole, note? }
respond_to_role_suggestion{ suggestionId, accept: true }
set_role_lock             { playerId, locked, reason }     // SUPER ADMIN ONLY
merge_players             { keepPlayerId, mergePlayerId }  // SUPER ADMIN ONLY
```

### 3.8 Stats & ranks

```
get_rankings              { board, teamIds?, matchAll?, format?, period?,
                            role?, minMatches?, limit, offset }
                          → { rows: [{ playerId, name, teamChips, rating,
                                       rank, globalRank, movement, confidence,
                                       qualified }], total }

get_player_career_stats   { playerId, format?, teamId? }
get_player_form           { playerId, lastN: 10 }
compare_players           { playerIdA, playerIdB }
rebuild_innings           { inningsId }                    // SUPER ADMIN
recompute_all_rankings    { }                              // SUPER ADMIN
```

`get_rankings` is the single endpoint behind the Ranks page. `teamIds = null`
gives the unfiltered global board — the default.

---

## 4. Realtime channels

| Channel | Events | Who |
|---|---|---|
| `match:{id}` | `postgres_changes` on `deliveries`, `innings`, `matches`, `scoring_grants` | scorers + audience |
| `match:{id}` | `broadcast: soft_lock` `{ profileId, action, ttl }` | scorers only |
| `match:{id}` | `presence` `{ profileId, role: 'scorer'\|'viewer' }` | all |
| `user:{profileId}` | `broadcast: notification` | that user |

---

## 5. Shared validation schemas

One Zod schema per payload in `src/features/*/schemas.ts`, used for:
1. client form validation,
2. the RPC request body shape,
3. generating the PL/pgSQL guard clauses (by hand, but kept in sync — a test
   asserts every Zod field has a corresponding server check).

```ts
export const DeliveryInputSchema = z.object({
  clientDeliveryId: z.string().uuid(),
  inningsId: z.string().uuid(),
  expectedSeq: z.number().int().nonnegative(),
  strikerId: z.string().uuid(),
  nonStrikerId: z.string().uuid(),
  bowlerId: z.string().uuid(),
  runsOffBat: z.number().int().min(0).max(12),
  extraType: z.enum(['wide','no_ball','bye','leg_bye','penalty']).nullable(),
  extraRuns: z.number().int().min(0).max(12).default(0),
  isBoundary: z.boolean().default(false),
  isFreeHit: z.boolean().default(false),
  wicket: z.object({
    type: WicketTypeSchema,
    dismissedPlayerId: z.string().uuid(),
    fielderId: z.string().uuid().optional(),
    assistFielderId: z.string().uuid().optional(),
    crossedBeforeDismissal: z.boolean().optional(),
  }).nullable().default(null),
  shot: z.object({ x: z.number().min(-1).max(1),
                   y: z.number().min(-1).max(1) }).optional(),
  commentaryOverride: z.string().max(280).optional(),
})
.refine(d => d.strikerId !== d.nonStrikerId, 'Batters must differ')
.refine(d => !(d.extraType === 'wide' && d.runsOffBat > 0),
        'No runs off the bat on a wide');
```

---

## 6. Error envelope

Every RPC returns the same shape on failure:

```jsonc
{
  "ok": false,
  "error": {
    "code": "STALE_SEQ",
    "message": "Another scorer recorded this ball.",
    "details": { "serverSeq": 88, "expectedSeq": 87 },
    "retryable": true
  }
}
```

`toAppError()` on the client maps `code` → a human message and a suggested
action. Raw Postgres error codes never reach the UI.

---

## 7. Rate limits

| Endpoint | Limit |
|---|---|
| `record_delivery` | 30/min per user per match (a real over is ~6) |
| `record_deliveries_batch` | 10/min, 50 items each |
| `issue_scoring_grant` | 20/hour per user |
| `redeem_handoff_token` | 5/min per IP |
| anon reads on `/live/*` | 120/min per IP |
| auth OTP | 5/hour per email or phone |

Enforced at the Supabase edge and re-checked in the RPCs for the sensitive ones.
