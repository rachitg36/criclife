# 04 — Cricket Rules Engine

The engine lives in `src/engine/` and is **pure**: no React, no network, no DOM.

```ts
applyDelivery(state: MatchState, input: DeliveryInput): EngineResult
```

Every score on every screen is a projection of the delivery log through this
function. If the engine is right, the app is right.

---

## 1. Match Configuration

All of these are read from `matches.config`. **Overs per innings is a setting**,
as required, and so is nearly everything around it.

| Key | Type | Default | Range / notes |
|---|---|---|---|
| `oversPerInnings` | int | `20` | 1–90. Drives the whole innings length. |
| `ballsPerOver` | int | `6` | 4–8. Supports novelty formats. |
| `playersPerSide` | int | `11` | 5–15. Determines all-out threshold. |
| `maxOversPerBowler` | int \| `"auto"` | `"auto"` | `auto` = `ceil(oversPerInnings / 5)` |
| `wideRuns` | int | `1` | Runs added for a wide, before any run scored off it |
| `noBallRuns` | int | `1` | |
| `byesEnabled` | bool | `true` | |
| `legByesEnabled` | bool | `true` | |
| `freeHitAfterNoBall` | bool | `true` | |
| `noBallFreeHitOnAllNoBalls` | bool | `true` | false = only front-foot no-balls |
| `lastManStanding` | bool | `false` | true = last batter bats alone, runs must be even-numbered to keep strike |
| `powerplays` | array | `[]` | `{name, fromOver, toOver, fieldersOutside}` |
| `superOverOnTie` | bool | `true` | |
| `retiredHurtCanReturn` | bool | `true` | |
| `penaltyRunsEnabled` | bool | `true` | |
| `declarationsEnabled` | bool | `false` | multi-day only, v2 |
| `followOnEnabled` | bool | `false` | v2 |
| `drsEnabled` | bool | `false` | v2 |

### Built-in rules profiles

| Profile | overs | balls/over | maxOversPerBowler | powerplays |
|---|---|---|---|---|
| T20 Standard | 20 | 6 | 4 | PP1 ov 1–6 (2 out) |
| ODI Standard | 50 | 6 | 10 | PP1 1–10, PP2 11–40, PP3 41–50 |
| T10 | 10 | 6 | 2 | PP1 1–3 |
| The Hundred | 100 balls | 5 | 20 balls | PP first 25 balls |
| Gully 8 | 8 | 6 | 2 | none |
| Custom | user-defined | | | |

---

## 2. Core state shape

```ts
type MatchState = {
  matchId: string;
  config: MatchConfig;
  status: MatchStatus;
  toss: { winnerTeamId: string; decision: 'bat' | 'bowl' } | null;
  innings: InningsState[];
  currentInningsIndex: number;
  result: MatchResult | null;
};

type InningsState = {
  inningsNo: number;
  battingTeamId: string;
  bowlingTeamId: string;

  runs: number;
  wickets: number;
  legalBalls: number;            // authoritative over counter
  extras: { wides: number; noBalls: number; byes: number;
            legByes: number; penalty: number };

  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
  previousBowlerId: string | null;   // cannot bowl consecutive overs

  isFreeHit: boolean;
  target: number | null;             // set for the chasing innings
  revisedTarget: number | null;
  revisedOvers: number | null;

  batters: Record<PlayerId, BatterState>;
  bowlers: Record<PlayerId, BowlerState>;
  fallOfWickets: FowEntry[];
  yetToBat: PlayerId[];

  status: 'in_progress' | 'completed' | 'declared' | 'abandoned';
  endReason: InningsEndReason | null;
};
```

Derived, never stored:

```ts
oversDisplay   = `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`
currentRunRate = runs / (legalBalls / ballsPerOver)
requiredRuns   = target - runs
ballsRemaining = oversPerInnings * ballsPerOver - legalBalls
requiredRate   = requiredRuns / (ballsRemaining / ballsPerOver)
projectedScore = runs + currentRunRate * (ballsRemaining / ballsPerOver)
```

---

## 3. Delivery input

```ts
type DeliveryInput = {
  clientDeliveryId: string;      // uuid, idempotency key
  runsOffBat: number;            // 0..6+ (all-run allowed)
  extraType: null | 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'penalty';
  extraRuns: number;             // runs *additional* to the automatic wideRuns/noBallRuns
  isBoundary: boolean;           // hit the rope (vs all-run)
  wicket: null | {
    type: WicketType;
    dismissedPlayerId: string;   // may be the NON-striker for a run out
    fielderId?: string;
    assistFielderId?: string;
    crossedBeforeDismissal?: boolean;  // run out: had the batters crossed?
  };
  shot?: { x: number; y: number };
  pitch?: { x: number; y: number };
  penaltyRuns?: number;
  commentaryOverride?: string;
};
```

---

## 4. The `applyDelivery` algorithm

Executed in this exact order. Order matters.

```
 1. VALIDATE
    - innings is in_progress
    - striker, non-striker, bowler are set and distinct
    - bowler is not the previousBowlerId (unless config allows)
    - bowler has overs remaining (maxOversPerBowler)
    - the wicket type is legal for this delivery (see §5.2 table)
    → on failure: return { ok: false, error }

 2. CLASSIFY LEGALITY
    isLegal = extraType !== 'wide' && extraType !== 'no_ball'

 3. COMPUTE RUNS
    autoExtra = extraType === 'wide'    ? config.wideRuns
              : extraType === 'no_ball' ? config.noBallRuns
              : 0

    switch (extraType) {
      case null:      batterRuns = runsOffBat; extraRuns = 0
      case 'wide':    batterRuns = 0;          extraRuns = autoExtra + input.extraRuns
      case 'no_ball': batterRuns = runsOffBat; extraRuns = autoExtra + input.extraRuns
      case 'bye':     batterRuns = 0;          extraRuns = input.extraRuns
      case 'leg_bye': batterRuns = 0;          extraRuns = input.extraRuns
      case 'penalty': batterRuns = 0;          extraRuns = input.penaltyRuns
    }
    totalRuns = batterRuns + extraRuns

 4. APPLY TO INNINGS TOTAL
    innings.runs += totalRuns
    innings.extras[bucket] += extraRuns    (wide/noBall/bye/legBye/penalty)

 5. APPLY TO BATTER
    if (extraType !== 'wide') batter.balls += 1     // a wide is not a ball faced
    batter.runs += batterRuns
    if (isBoundary && batterRuns === 4) batter.fours += 1
    if (isBoundary && batterRuns === 6) batter.sixes += 1

 6. APPLY TO BOWLER
    if (isLegal) bowler.legalBalls += 1
    // byes and leg-byes are NOT charged to the bowler
    bowler.runsConceded += (extraType === 'bye' || extraType === 'leg_bye')
                             ? 0
                             : totalRuns
    if (extraType === 'wide')    bowler.wides += 1
    if (extraType === 'no_ball') bowler.noBalls += 1
    if (totalRuns === 0 && isLegal) bowler.dots += 1

 7. FREE HIT RESOLUTION  (BEFORE processing this ball's wicket)
    wasFreeHit = innings.isFreeHit
    if (extraType === 'no_ball' && config.freeHitAfterNoBall)
        nextIsFreeHit = true
    else if (extraType === 'wide')
        nextIsFreeHit = wasFreeHit      // a wide does NOT consume a free hit
    else
        nextIsFreeHit = false

 8. APPLY WICKET
    if (wicket) {
      if (!isWicketAllowed(wicket.type, extraType, wasFreeHit))
          return { ok:false, error:'ILLEGAL_DISMISSAL' }
      innings.wickets += 1
      mark dismissed batter out, record dismissal text + FOW entry
      if (wicket.type is credited to bowler) bowler.wickets += 1
      credit fielder: catch / run_out / stumping
    }

 9. STRIKE ROTATION            ← see §6, this is the classic bug source

10. OVER COMPLETION
    if (isLegal && innings.legalBalls % config.ballsPerOver === 0) {
       swap striker/non-striker
       previousBowlerId = bowlerId; bowlerId = null   // prompt for next bowler
       if bowler conceded 0 runs in the over && bowled full over → maiden
       emit OVER_COMPLETE event
    }

11. NEW BATTER REQUIRED
    if (wicket && dismissal removes a batter && innings not over)
       emit NEW_BATTER_REQUIRED (blocks further input until resolved)

12. INNINGS / MATCH END CHECK   ← see §7

13. GENERATE COMMENTARY, RETURN new state + events
```

---

## 5. Dismissals

### 5.1 Credit table

| Wicket type | Bowler credited | Fielder credited | Batter's balls counted |
|---|---|---|---|
| `bowled` | ✅ | — | ✅ |
| `caught` | ✅ | catch | ✅ |
| `lbw` | ✅ | — | ✅ |
| `stumped` | ✅ | stumping (keeper) | ✅ |
| `hit_wicket` | ✅ | — | ✅ |
| `run_out` | ❌ | run-out (+assist) | ✅ |
| `obstructing_the_field` | ❌ | — | ✅ |
| `hit_ball_twice` | ❌ | — | ✅ |
| `timed_out` | ❌ | — | ❌ |
| `retired_out` | ❌ | — | ✅ |
| `retired_hurt` | ❌ (not a wicket at all) | — | ✅ |
| `handled_the_ball` | ❌ *(merged into obstructing under current Laws; kept for legacy)* | — | ✅ |

`retired_hurt` does **not** increment `innings.wickets`. The batter's card status
becomes `retired_hurt` and, if `config.retiredHurtCanReturn`, they re-enter
`yetToBat` at the end.

### 5.2 Which dismissals are legal on which ball

| | Normal ball | Wide | No-ball | Free hit |
|---|---|---|---|---|
| bowled | ✅ | ❌ | ❌ | ❌ |
| caught | ✅ | ❌ | ❌ | ❌ |
| lbw | ✅ | ❌ | ❌ | ❌ |
| stumped | ✅ | ✅ | ❌ | ❌ |
| hit wicket | ✅ | ❌ | ❌ | ❌ |
| **run out** | ✅ | ✅ | ✅ | ✅ |
| obstructing the field | ✅ | ✅ | ✅ | ✅ |
| hit ball twice | ✅ | ❌ | ✅ | ✅ |
| timed out | ✅ | — | — | — |

> **The free-hit rule that everyone gets wrong:** on a free hit, the only ways
> out are run out, obstructing the field, and hit-the-ball-twice. The UI must
> physically disable the other buttons — do not rely on the scorer knowing this.

### 5.3 Run out specifics

- `dismissedPlayerId` may be the **non-striker**. The pad must ask "who's out?"
  with two big buttons showing both batters' names.
- `crossedBeforeDismissal` determines who is on strike for the next ball.
- Runs completed before the run out **do** count. The scorer enters them as
  `runsOffBat` (or as byes if off the pad) *and* the wicket, on the same ball.
- A run out off a wide: the wide run still counts.

---

## 6. Strike rotation

The single most bug-prone rule. Implement exactly this:

```ts
function resolveStrike(s: InningsState, d: Delivery, cfg: MatchConfig) {
  let swap = false;

  // 1. Runs that physically change ends
  const runsThatCrossed =
      d.extraType === 'wide'
        ? Math.max(0, d.runsExtras - cfg.wideRuns)   // runs run off a wide
        : d.extraType === 'bye' || d.extraType === 'leg_bye'
          ? d.runsExtras
          : d.runsBatter;

  if (runsThatCrossed % 2 === 1) swap = true;

  // 2. Boundaries never change ends (4 and 6 are even anyway, but be explicit)
  if (d.isBoundaryFour || d.isBoundarySix) swap = false;

  // 3. Run out: the surviving batter's end is determined by `crossed`
  if (d.wicketType === 'run_out') {
    swap = resolveRunOutEnds(s, d);   // explicit, see below
  }

  // 4. New batter after a non-run-out wicket always comes in at the
  //    STRIKER's end — i.e. the new batter faces next, unless the over ended.
  //    (Handled by placing the new batter at the position the dismissed one held.)

  // 5. End of over swap is applied AFTER all of the above, in step 10.
  if (swap) [s.strikerId, s.nonStrikerId] = [s.nonStrikerId, s.strikerId];
}
```

**Last-man-standing mode** (`config.lastManStanding = true`): with one batter
left, they bat alone. An odd number of runs means they would be at the wrong end
— in this mode the engine keeps them on strike and the over-end swap is
suppressed. Show a persistent banner in the scorer view when this mode is active.

---

## 7. Innings and match end conditions

### 7.1 Innings ends when

| Condition | `endReason` |
|---|---|
| `wickets === playersPerSide - 1` (or `=== playersPerSide` in last-man-standing) | `all_out` |
| `legalBalls === oversPerInnings * ballsPerOver` | `overs_complete` |
| Chasing innings and `runs >= target` | `target_reached` |
| Captain declares (`declarationsEnabled`) | `declared` |
| Match abandoned | `abandoned` |

Special case: if the winning run is scored off a no-ball or wide, the innings
ends immediately on that ball.

### 7.2 Match result

```
if (innings2.runs >= target)          → team B wins by (playersPerSide-1 - w2) wickets
else if (innings2.runs === target-1)  → TIE
else                                  → team A wins by (target-1 - innings2.runs) runs
```

On a tie with `superOverOnTie`: create innings 3 and 4 with
`oversPerInnings = 1`, `is_super_over = true`, each side picks 3 batters and 1
bowler, the innings ends at 2 wickets. If the super over ties, repeat
(configurable max 3 attempts, then boundary countback, then declared a tie).

---

## 8. Bowler constraints

- `maxOversPerBowler` enforced: the bowler picker greys out anyone at their limit
  and shows `4/4`.
- A bowler cannot bowl two consecutive overs — `previousBowlerId` is excluded
  from the picker.
- A bowler who leaves the field cannot bowl until they have been back for as
  long as they were absent. **v1 does not enforce this** — it shows a
  soft warning only, because tracking field absence at gully level is noise.
- Part-over changes: if a bowler is injured mid-over, the scorer taps
  `Change bowler mid-over`. Both bowlers get partial over credit
  (`legalBalls` is per-bowler, so overs display as `2.3`).

---

## 9. Powerplays and field restrictions

- Defined in config as over ranges.
- The engine exposes `getCurrentPowerplay(state)` for UI display.
- v1 does **not** validate fielder positions (nobody is entering fielder
  coordinates ball by ball at this level). It displays the active powerplay
  badge and logs `powerplay_start` / `powerplay_end` in `innings_intervals`.

---

## 10. Undo, edit, and recompute

### Undo
- Soft-deletes the most recent non-deleted delivery (`is_deleted = true`).
- Writes a `delivery_edits` row.
- **The engine then replays the innings from ball 1.** Do not attempt to
  "reverse" a delivery — reversal logic is where correctness dies. Replay is
  cheap (a 20-over innings is ~130 rows).
- Undo depth is unlimited within the current innings; crossing an innings
  boundary requires a confirmation dialog.

### Edit an earlier ball
- Opens that ball in the pad with its values pre-filled.
- On save: soft-delete the old row, insert a corrected row with the **same
  `seq`**, write the audit entry, replay the innings.
- A small `edited` marker appears on that ball in the audience feed with a
  tooltip showing who changed it and when.

### Full recompute
`rebuild_innings(innings_id)` — a Postgres function that recomputes all
denormalised totals and card entries from `deliveries`. Also exposed to Super
Admin as a button. This is the safety net: **the delivery log is truth, every
other number is a cache.**

---

## 11. Auto-commentary generation

Every delivery gets a generated one-liner for the audience feed. Scorer can
override.

```
Templates:
  0 runs          → "{bowler} to {striker}, no run"
  1-3 runs        → "{bowler} to {striker}, {n} run(s)"
  4 (boundary)    → "{bowler} to {striker}, FOUR! {randomFourPhrase}"
  6               → "{bowler} to {striker}, SIX! {randomSixPhrase}"
  wide            → "{bowler} to {striker}, wide"
  no ball         → "{bowler} to {striker}, NO BALL{, n runs}"
  bye             → "{bowler} to {striker}, {n} bye(s)"
  bowled          → "{bowler} to {striker}, BOWLED HIM! {striker} b {bowler} {r}({b})"
  caught          → "{bowler} to {striker}, CAUGHT! c {fielder} b {bowler} {r}({b})"
  lbw             → "{bowler} to {striker}, LBW! {r}({b})"
  run out         → "{bowler} to {striker}, RUN OUT! {dismissed} run out ({fielder})"
  stumped         → "{bowler} to {striker}, STUMPED! st {fielder} b {bowler}"
  milestone       → appended: "That's a fifty for {striker}! / MAIDEN over"
```

Phrase pools live in `src/engine/commentary.ts` so they can be themed later.

---

## 12. Test plan for the engine

`tests/engine/` must cover, at minimum:

**Fixtures** — three full real-match delivery logs (a T20, an ODI, an 8-over
gully game) replayed ball by ball, asserting the final scorecard matches a
known-good scorecard exactly.

**Property tests** (fast-check):
- `sum(delivery.runs_total) === innings.runs` for any random valid log
- `count(is_legal) === innings.legalBalls`
- `innings.wickets <= playersPerSide - 1`
- replaying a log always produces identical state (determinism)
- undo-then-redo returns to the identical state

**Unit tests** — one per row of the §5.2 legality table, plus:

| Case | Expectation |
|---|---|
| Wide with 2 runs run | 3 to extras, batter's balls unchanged, strike swaps |
| No-ball hit for 6 | 7 total, 6 to batter, batter's balls +1, next ball free hit |
| Free hit, batter bowled | not out, runs stand, free hit persists? (no — free hit consumed by a legal ball) |
| Free hit, wide bowled | free hit **persists** to the next ball |
| Bye 4 | 4 to extras, bowler concedes 0, batter's balls +1, no strike change |
| Leg bye 1 | strike swaps, bowler concedes 0 |
| Run out on the last ball of the over, batters crossed | correct batter on strike next over |
| 3 runs on the last ball of the over | strike swaps twice = net no swap |
| Maiden with a wide in it | not a maiden |
| Winning run off a no-ball | innings ends immediately, result correct |
| All out on a run out of the non-striker | correct batter remains |
| Bowler hits `maxOversPerBowler` | excluded from picker |
| `ballsPerOver = 5` (The Hundred) | over completes at 5 |
| `playersPerSide = 8` | all out at 7 wickets |
| Last-man-standing on | innings continues at 7 down with 8 a side |
| Super over tie → second super over | created correctly |

**Do not ship** without the three fixture replays passing byte-identical.
