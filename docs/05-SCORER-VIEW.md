# 05 — Scorer View (Zero-Scroll Mobile)

> **The hard requirement:** "This will run on a mobile, so there should be
> minimum scrolling when somebody is scoring the match."

We are stricter than that. **The scoring screen scrolls zero pixels. Ever.**
`overflow: hidden` on the scoring shell. If content does not fit, the design is
wrong — not the phone.

---

## 1. Layout budget

Reference device: **iPhone SE / small Android, 375 × 667 CSS px**, installed PWA
(no browser chrome). Everything below fits with room to spare on a 390×844.

```
┌─────────────────────────────────────────┐ 0px
│ ░░ STATUS STRIP                    28px │  team badge · overs · rights dot
├─────────────────────────────────────────┤ 28
│                                         │
│   MUM  147-4        ← 68px score        │
│   14.3 / 20 ov      CRR 10.14           │  SCORE BLOCK  92px
│   Need 43 off 33 · RRR 7.81             │
├─────────────────────────────────────────┤ 120
│ ● Sharma*   62 (41)   ┃ Patel  23 (19)  │  BATTERS       44px
├─────────────────────────────────────────┤ 164
│ Bumrah  3.3-0-28-2         ECON 8.00    │  BOWLER        36px
├─────────────────────────────────────────┤ 200
│ THIS OVER  · 1 · 4 W ·                  │  OVER DOTS     40px
├─────────────────────────────────────────┤ 240
│                                         │
│    ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│    │  0  │ │  1  │ │  2  │ │  3  │      │  RUN PAD
│    └─────┘ └─────┘ └─────┘ └─────┘      │  2 rows × 4
│    ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │  ≈ 168px
│    │  4  │ │  6  │ │  5  │ │ 7+  │      │
│    └─────┘ └─────┘ └─────┘ └─────┘      │
│                                         │
├─────────────────────────────────────────┤ 420
│  ┌──────┐┌──────┐┌──────┐┌──────┐       │
│  │ WIDE ││ NO-B ││ BYE  ││  LB  │       │  MODIFIER ROW  56px
│  └──────┘└──────┘└──────┘└──────┘       │  (toggles, sticky)
├─────────────────────────────────────────┤ 476
│  ┌──────────────────┐ ┌───────┐ ┌─────┐ │
│  │      WICKET      │ │ UNDO  │ │  ⋯  │ │  ACTION ROW    64px
│  └──────────────────┘ └───────┘ └─────┘ │
├─────────────────────────────────────────┤ 540
│  ⌂  Scorecard   Map   Feed   Settings   │  TAB BAR       56px
└─────────────────────────────────────────┘ 596  ✅ fits 667
```

Remaining ~70px is safe-area inset + breathing room. On taller phones the run
pad buttons grow, they do not get pushed off.

---

## 2. Interaction model

### The one-tap path
A normal ball — say 1 run — is **one tap**. Tap `1`. Done. The engine applies
it, the score animates, strike rotates, haptic fires, the over-dots strip gains
a `1`. No confirm. No dialog.

This is the 85% case and it must never cost more than one tap.

### Modifiers are toggles, not modes
Tap `WIDE` → it lights up. Now tap `2` → records a wide with 2 additional runs
run. The modifier auto-clears after the ball. Tap `WIDE` then tap `WIDE` again
to record a plain wide with no runs (double-tap on the modifier = commit it
alone with 0 extra runs).

| Sequence | Result |
|---|---|
| `1` | 1 run off the bat |
| `4` | four |
| `WIDE` `WIDE` | wide, 1 extra |
| `WIDE` `2` | wide + 2 run = 3 extras |
| `NO-B` `6` | no-ball, 6 to batter = 7 total, free hit next |
| `BYE` `4` | 4 byes |
| `LB` `1` | 1 leg bye |
| `0` | dot ball |
| `7+` | opens a number wheel for 5, 7, 8… (rare) |

### Wicket — 3 taps maximum
Tap `WICKET` → a **bottom sheet slides up over the run pad only** (the score
block stays visible, still no scroll):

```
┌─────────────────────────────────────────┐
│  HOW OUT?                          [✕]  │
│  ┌────────┐┌────────┐┌────────┐         │
│  │ BOWLED ││ CAUGHT ││  LBW   │         │  ← 6 big tiles
│  ├────────┤├────────┤├────────┤         │
│  │RUN OUT ││STUMPED ││  MORE  │         │
│  └────────┘└────────┘└────────┘         │
└─────────────────────────────────────────┘
```

- `BOWLED` / `LBW` → **committed immediately**. 2 taps total.
- `CAUGHT` → a fielder grid appears (one avatar per fielder — `playersPerSide`,
  not necessarily 11 — in 3 columns).
  Tap the fielder → committed. 3 taps.
- `RUN OUT` → "Who's out?" two huge buttons (striker / non-striker), then the
  fielder grid, then "Did they cross?" if runs > 0. Up to 4 taps — acceptable,
  it's the rare complex case.
- On a **free hit**, only `RUN OUT` and `MORE → obstructing` are enabled.
  Everything else is visibly disabled with a "Free hit" label on the sheet.

### New batter — 1 tap
After a wicket, the pad is replaced (same footprint, no scroll) by the
remaining batting order as a tappable list, next-in-order pre-highlighted at the
top. Tap a name → back to the pad. A `Change order` link reveals the full squad.

### New bowler — 1 tap
At the end of an over, the pad is replaced by the bowler grid: the fielding side
as tiles showing `O-M-R-W`, with:
- the previous over's bowler greyed out (cannot bowl consecutively),
- anyone at `maxOversPerBowler` greyed out with `4/4`,
- the most likely bowler (fewest overs used, has bowled before) subtly ringed.

### Undo
`UNDO` reverses the last ball with a spring-out animation on the over-dot strip
and a 4-second "Undone · Redo" toast. Long-press `UNDO` → the ball history list
for editing an earlier ball.

### The `⋯` overflow
Rare actions, in a sheet: `Retire batter`, `Change bowler mid-over`,
`Penalty runs`, `Drinks / Rain interval`, `Edit a previous ball`,
`Declare innings`, `Abandon match`, `Swap strike manually`,
`Correct the over count`.

---

## 3. Never-scroll enforcement

1. Shell is `height: 100dvh; overflow: hidden; overscroll-behavior: none;`
2. `viewport-fit=cover` + `env(safe-area-inset-*)` padding.
3. All vertical sizes are `clamp()`-based off `dvh`, so on a small phone the run
   pad shrinks proportionally rather than overflowing.
4. Sheets are `position: fixed` overlays sized to a max of 60dvh — they cover
   the pad, never push it.
5. `touch-action: manipulation` everywhere — kills the 300ms tap delay and
   double-tap zoom.
6. A dev-mode assertion logs a warning if `scrollHeight > clientHeight` on the
   scoring shell. This is checked in the Playwright suite at 320×568,
   375×667, 390×844, and 430×932.

---

## 4. Ergonomics

- **Thumb zone.** The run pad occupies the lower-middle third — the natural
  thumb arc. Destructive actions (`Abandon`) are behind `⋯`, far from it.
- **Handedness.** `profiles.scorer_hand` mirrors the pad: for a left-handed
  scorer, `WICKET` and `UNDO` swap sides.
- **Minimum target 56×56px**, 8px gaps, well above the 44px guideline.
- **Haptics** on every commit: light tap for a dot, medium for runs,
  double-pulse for a boundary, heavy for a wicket.
- **Accidental-tap guard:** two identical taps within 250ms register as one.
  A second tap in 250–600ms shows an inline "Recorded twice? Undo" chip.
- **Wake lock:** `navigator.wakeLock` keeps the screen on while scoring, with a
  visible indicator and a manual off switch.
- **Landscape**: run pad moves to the right half, info to the left. Still no scroll.

---

## 5. States the pad can be in

| State | Pad shows | Trigger |
|---|---|---|
| `READY` | Normal run pad | default |
| `AWAITING_BOWLER` | Bowler grid | over complete / innings start |
| `AWAITING_BATTER` | Batting order list | wicket fell |
| `AWAITING_OPENERS` | Two-slot picker | innings start |
| `MODIFIER_ARMED` | Pad with a lit modifier | wide/no-b/bye/lb tapped |
| `WICKET_SHEET` | Dismissal sheet | wicket tapped |
| `INNINGS_BREAK` | "Start 2nd innings" CTA + summary | innings ended |
| `MATCH_OVER` | Result card + "Publish" | match ended |
| `READ_ONLY` | Dimmed pad + "Your scoring rights were revoked" | grant revoked |
| `OFFLINE` | Normal pad + amber sync pill | network lost |
| `STALE` | Blurred pad + "Priya recorded a ball — refreshing" | conflict |

---

## 6. Offline behaviour

The scorer must be able to score an entire match in a dead zone.

1. Every delivery writes **first** to IndexedDB (Dexie) with a
   `clientDeliveryId` and a local `pendingSeq`, then optimistically to the
   Zustand match store. The UI never waits on the network.
2. A background sync worker drains the queue whenever online.
3. The status strip shows a **sync pill**: `●  synced` / `⟳ 7 pending` / `⚠ offline`.
4. On reconnect, the queue is posted in order. `clientDeliveryId` uniqueness
   makes replays safe.
5. **If the grant was revoked while offline**, the server rejects the batch.
   Rejected balls go into a *Review tray* — never silently dropped, never
   silently applied. The scorer sees them and can hand them to a current holder.
6. If a co-scorer recorded conflicting balls while this device was offline, the
   app shows a **merge screen**: both sequences side by side, ball by ball,
   with `Keep mine / Keep theirs / Keep both` per divergence. Server order wins
   by default.
7. Dexie retains the full local log for the match until 24h after completion, so
   a crashed/closed tab loses nothing.

---

## 7. The scorer's other tabs

The tab bar is present, but tapping away and back must restore the pad
instantly (state lives in Zustand, not the route).

| Tab | Content |
|---|---|
| **Score** | The pad. Default. |
| **Scorecard** | Full batting/bowling cards, scrollable (scrolling is fine *here*). |
| **Map** | The Scoring Rights Map — see [03](./03-ROLES-PERMISSIONS.md) §3.4. |
| **Feed** | Ball-by-ball commentary, editable inline by the scorer. |
| **Settings** | Match config (live-editable fields only), theme, haptics, handedness. |

---

## 8. Advanced Mode (optional, off by default)

For scorers who want richer data. Enabled per-match in settings. Adds **one
extra tap** per ball, so it is never on by default.

After committing a ball, a small pitch/field overlay appears for 2 seconds:
tap where the ball went (wagon wheel) or where it pitched. Ignore it and it
fades — the ball is already recorded. This populates `shot_x/y` and
`pitch_x/y` for the wagon wheel and pitch map on the audience view.

---

## 9. Visual treatment

Per [08-DESIGN-SYSTEM](./08-DESIGN-SYSTEM.md), but with a **reduced motion
budget** — the scorer needs speed, not fireworks.

- Score numerals: `tabular-nums`, 68px, weight 800, count-up spring on change.
- The whole screen tints subtly toward the **batting team's `primary_color`**.
- Run pad buttons: glass surface, 1px luminous border, `scale(0.94)` +
  radial ripple from the touch point on press, 120ms.
- `4` and `6` buttons carry a permanent accent gradient — they are the fun ones.
- `WICKET` is the only red element on the screen.
- Over-dot strip: each ball is a pill that springs in from the right; a wicket
  pill is red and pulses once.
- Boundary celebration in scorer view = a single 300ms edge glow, **not** the
  full particle burst (that's the audience's job).
- Wicket = 150ms screen shake + red vignette + heavy haptic.
