# 09 — Application Architecture

---

## 1. Layered model

```
┌────────────────────────────────────────────────────────┐
│  UI LAYER          React components, Tailwind, Motion  │
│                    Knows nothing about cricket rules   │
├────────────────────────────────────────────────────────┤
│  FEATURE LAYER     hooks + feature modules             │
│                    useScoring(), useRanks(), ...       │
├────────────────────────────────────────────────────────┤
│  STATE LAYER       Zustand (live match) +              │
│                    TanStack Query (server cache)       │
├────────────────────────────────────────────────────────┤
│  ENGINE LAYER      src/engine — PURE cricket rules     │
│                    zero deps, exhaustively tested      │
├────────────────────────────────────────────────────────┤
│  DATA LAYER        Supabase client · Dexie · sync      │
├────────────────────────────────────────────────────────┤
│  BACKEND           Postgres + RLS + Realtime + Edge fn │
└────────────────────────────────────────────────────────┘
```

**The one architectural rule that matters:** the engine layer is pure. It takes
state and an input, returns new state. It cannot fetch, cannot render, cannot
touch `Date.now()` (time is passed in). Everything above it is replaceable;
the engine is the asset.

---

## 2. Folder structure

```
src/
├─ app/
│  ├─ router.tsx                  route tree
│  ├─ providers.tsx               Query, Theme, Auth, Realtime, Toast
│  ├─ layouts/
│  │  ├─ RootLayout.tsx
│  │  ├─ AppLayout.tsx            authed shell + bottom nav
│  │  ├─ ScoringLayout.tsx        100dvh, overflow hidden
│  │  └─ PublicLayout.tsx         audience, no auth
│  └─ guards/
│     ├─ RequireAuth.tsx
│     ├─ RequireSuperAdmin.tsx
│     └─ RequireScoringGrant.tsx
│
├─ engine/                        ⬅ PURE. no react, no network, no dom.
│  ├─ types.ts
│  ├─ config.ts                   MatchConfig defaults + rules profiles
│  ├─ applyDelivery.ts            the core reducer
│  ├─ strike.ts                   strike rotation
│  ├─ dismissals.ts               legality table + credit rules
│  ├─ inningsEnd.ts               end conditions
│  ├─ result.ts                   match result + margins
│  ├─ replay.ts                   fold a delivery[] into MatchState
│  ├─ projections.ts              CRR, RRR, projected, partnerships
│  ├─ scorecard.ts                build batting/bowling cards from log
│  ├─ commentary.ts               auto text generation
│  └─ index.ts
│
├─ features/
│  ├─ auth/
│  ├─ teams/       components/ hooks/ api/ schemas.ts
│  ├─ players/
│  ├─ matches/
│  ├─ scoring/
│  │  ├─ components/ScorePad.tsx WicketSheet.tsx BowlerPicker.tsx
│  │  │              BatterPicker.tsx OverStrip.tsx SyncPill.tsx
│  │  ├─ hooks/useScoring.ts useOfflineQueue.ts useSoftLock.ts
│  │  └─ store.ts
│  ├─ grants/      ScoringRightsMap.tsx GrantSheet.tsx HandoffQR.tsx
│  ├─ audience/
│  ├─ stats/
│  ├─ ranks/
│  ├─ settings/
│  └─ admin/
│
├─ components/
│  ├─ ui/                         shadcn primitives (owned, editable)
│  ├─ viz/                        WormChart ManhattanChart WagonWheel
│  │                              PitchMap PartnershipBars RadarCompare
│  ├─ motion/                     CountUp Celebration ShakeOnWicket
│  └─ icons/cricket/
│
├─ lib/
│  ├─ supabase.ts
│  ├─ db.ts                       Dexie schema
│  ├─ sync.ts                     offline queue drain + conflict merge
│  ├─ realtime.ts                 channel manager
│  ├─ theme.ts
│  ├─ haptics.ts
│  ├─ format.ts                   overs, averages, "62*"
│  └─ analytics.ts
│
├─ stores/
│  ├─ matchStore.ts               live MatchState (zustand)
│  ├─ uiStore.ts                  theme, calm mode, handedness
│  └─ authStore.ts
│
├─ hooks/                         useMediaQuery useWakeLock useOnline ...
└─ styles/
   ├─ tokens.css
   ├─ globals.css
   └─ animations.css
```

---

## 3. State management split

| Kind of state | Tool | Example |
|---|---|---|
| Server data, cached | **TanStack Query** | teams list, player profile, rankings |
| Live match state | **Zustand** | current innings, striker, pending modifier |
| Offline queue | **Dexie** | unsynced deliveries |
| Ephemeral UI | React `useState` | is a sheet open |
| URL state | React Router | ranks filters, active tab |
| User prefs | Zustand + `localStorage` | theme, handedness, calm mode |

### The live match store

```ts
type MatchStore = {
  matchState: MatchState | null;      // engine output, single source for UI
  deliveries: Delivery[];             // full log, drives replay
  pendingModifier: ExtraType | null;
  padState: PadState;
  syncStatus: 'synced' | 'pending' | 'offline' | 'error';
  pendingCount: number;

  recordDelivery(input: DeliveryInput): void;   // optimistic
  undoLast(): void;
  editDelivery(id: string, input: DeliveryInput): void;
  setBowler(id: string): void;
  setNewBatter(id: string): void;
  hydrateFromServer(rows: Delivery[]): void;
};
```

`recordDelivery` flow:

```
1. engine.applyDelivery(matchState, input)   → new state, synchronous
2. set store state                            → UI updates instantly (0ms)
3. dexie.pendingDeliveries.add(row)           → durable
4. fire haptic
5. queue.enqueue(row)                         → background POST
6. on server ack: mark synced, reconcile seq
7. on server reject: rollback via replay, surface the error
```

The UI **never awaits the network**. This is what makes scoring feel instant.

---

## 4. Realtime

One channel per match: `match:{matchId}`.

```ts
supabase
  .channel(`match:${matchId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'deliveries',
        filter: `match_id=eq.${matchId}` },
      onDelivery)
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'innings',
        filter: `match_id=eq.${matchId}` },
      onInnings)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'scoring_grants',
        filter: `match_id=eq.${matchId}` },
      onGrantChange)          // instantly locks a revoked scorer's pad
  .on('broadcast', { event: 'soft_lock' }, onSoftLock)
  .on('presence', { event: 'sync' }, onPresence)   // who's watching / scoring
  .subscribe();
```

- **Scorers** subscribe to everything, including `broadcast` for soft locks.
- **Audience** subscribes read-only to `deliveries`, `innings`, `matches`.
- Presence powers "3 scorers · 47 watching" in the header and the live nodes on
  the Scoring Rights Map.
- Reconnect: exponential backoff (1s → 30s), then a full refetch and engine
  replay on recovery. Any gap in `seq` triggers a refetch of the missing range.

---

## 5. Offline architecture

### Dexie schema

```ts
db.version(1).stores({
  pendingDeliveries: 'clientDeliveryId, matchId, createdAt, status',
  cachedMatches:     'id, updatedAt',
  cachedDeliveries:  'id, matchId, seq',
  cachedPlayers:     'id',
  cachedTeams:       'id',
  outbox:            '++id, type, createdAt, attempts',
});
```

### Sync worker

```
every 5s while online, and immediately on 'online' event:
  batch = pendingDeliveries.where(status='queued').limit(50).sortBy('createdAt')
  POST /rpc/record_deliveries_batch  { deliveries: batch }
  → 200: mark synced, store server seq, prune after 24h
  → 409 STALE_SEQ: refetch innings, engine.replay(), re-evaluate each queued
                   ball, present a merge screen if they now conflict
  → 403 NO_GRANT: move batch to status='rejected' → Review Tray
  → 5xx / network: backoff, increment attempts, keep queued
```

### Service worker (Workbox)

| Route | Strategy |
|---|---|
| App shell (JS/CSS/HTML) | Precache + `StaleWhileRevalidate` |
| Fonts, icons | `CacheFirst`, 1 year |
| Team crests, player photos | `CacheFirst`, 30 days, max 200 entries |
| Supabase REST GET | `NetworkFirst`, 5s timeout, 24h fallback cache |
| Supabase writes | **Never cached.** Handled by our own Dexie queue. |

A new service worker version shows a "New version available — Reload" toast
rather than reloading under a scorer's thumb mid-match. **Updates are blocked
entirely while `padState !== 'READY'` or the queue is non-empty.**

---

## 6. Routing & code splitting

```
/                              → Home (live + recent matches)
/login
/onboarding

/teams                         → list
/teams/new
/teams/:teamId                 → overview / squad / matches / stats
/teams/:teamId/squad
/teams/:teamId/settings

/players/:playerId             → profile + career stats
/players/:playerId/edit        → self or super admin only

/matches                       → list, filterable
/matches/new                   → 4-step wizard
/matches/:matchId              → hub (routes by role & status)
/matches/:matchId/setup        → toss, XI
/matches/:matchId/score        → SCORER VIEW    (RequireScoringGrant)
/matches/:matchId/rights       → SCORING RIGHTS MAP
/matches/:matchId/scorecard
/matches/:matchId/feed
/matches/:matchId/settings
/matches/:matchId/review       → Review Tray (rejected offline balls)

/live/:publicSlug              → AUDIENCE VIEW  (public, no auth)
/live/:publicSlug?tv=1         → big-screen mode

/ranks                         → global, default
/ranks?board=bowling&teams=a,b → filtered, shareable

/stats
/settings                      → profile / appearance / notifications
/admin                         → users / matches / data / audit  (SuperAdmin)
```

Split points: `/score` (engine + pad), `/live` (charts + particles),
`/ranks` (charts), `/admin` — each a separate lazy chunk. The audience bundle
must not include the scoring pad, and vice versa.

---

## 7. Edge functions

| Function | Trigger | Job |
|---|---|---|
| `finalize_match` | match status → completed | rebuild innings, write cards + `player_match_stats`, lock the match, enqueue ranking recompute |
| `recompute_rankings` | after finalize + nightly 03:00 | refresh MV, compute all boards, write `ranking_snapshots` |
| `og_image` | on share | render a live-score OG card |
| `send_notifications` | on grant change, wicket, milestone, result | web push |
| `claim_player` | claim code submitted | link a shadow player to a profile, audit |
| `merge_players` | Super Admin | merge duplicate player records, repoint deliveries |

---

## 8. Error handling

- **Error boundaries** per route; the scoring route has a dedicated boundary
  that preserves the Dexie queue and offers "Reload scorer — your 7 unsynced
  balls are safe."
- All Supabase errors pass through `toAppError()` which maps Postgres codes to
  human messages. Never show `23505` to a user.
- Sentry captures every failed delivery write with the full `MatchState` as
  context (PII-scrubbed). Scoring failures are the highest-severity alert.
- A global `<OfflineBanner>` reads `useOnline()` + `pendingCount`.

---

## 9. Testing strategy

| Layer | Tool | Coverage bar |
|---|---|---|
| Engine | Vitest + fast-check | **100% branches.** Non-negotiable. |
| Hooks / stores | Vitest + Testing Library | 80% |
| Components | Testing Library | Critical paths only |
| RLS policies | pgTAP against a seeded DB | Every policy, as 4 personas |
| E2E | Playwright | The 8 flows below |
| Visual | Playwright screenshots | Scorer + audience, both themes, 4 viewports |
| A11y | axe-core in Playwright | Zero serious violations |

**E2E flows that must always pass:**
1. Sign up → create team → add 11 players → create match → toss → score 2 overs.
2. Player logs in, changes own role to all-rounder, verifies it persists.
3. Team admin tries to change another player's role → blocked, offered "suggest".
4. Scorer A passes the token to Scorer B; A's pad locks, B's unlocks.
5. Two grant holders score simultaneously → no double count, conflict surfaced.
6. Go offline, score 12 balls, come back online → all 12 sync exactly once.
7. Grant revoked while a scorer is offline → balls land in the Review Tray.
8. Complete a match → stats appear → ranks page updates → filter by team works.

**Scroll assertion:** at 320×568, 375×667, 390×844 and 430×932, the scoring
route's shell must report `scrollHeight === clientHeight`. This test gates
every PR touching the scorer view.

---

## 10. Performance budgets

| Metric | Budget |
|---|---|
| Initial JS (audience route) | ≤ 180 KB gz |
| Initial JS (scorer route) | ≤ 220 KB gz |
| LCP on 4G | ≤ 1.8 s |
| INP on tap-to-score | ≤ 100 ms |
| Engine `applyDelivery` | ≤ 1 ms |
| Full innings replay (130 balls) | ≤ 15 ms |
| Lighthouse mobile perf | ≥ 90 |

Enforced by `size-limit` in CI and a Lighthouse CI run on every PR.
