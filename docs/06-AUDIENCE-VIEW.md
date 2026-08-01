# 06 — Audience View

The audience view is where the app earns its "futuristic" reputation. It is
public, needs no login, and is shared as a single link:
`criclife.app/live/mum-vs-che-8f3a`.

Unlike the scorer view, **scrolling is welcome here** — it's a browsing
experience. But the hero block must tell you everything in the first screenful.

---

## 1. Screen structure

```
┌─────────────────────────────────────────┐
│  ◀  MUM vs CHE · Wankhede      ⟳ LIVE   │  header, sticky
├─────────────────────────────────────────┤
│                                         │
│   ╭───────── HERO ──────────╮           │  animated aurora bg
│   │  MUM                     │          │  tinted to batting team
│   │   1 4 7 – 4              │          │  ← 84px, count-up
│   │   14.3 / 20 overs        │          │
│   │                          │          │
│   │   CHE  189-6 (20)        │          │  target line
│   │   ─────────────────────  │          │
│   │   Need 43 off 33 balls   │          │
│   │   CRR 10.14 · RRR 7.81   │          │
│   ╰──────────────────────────╯          │
│                                         │
│   ▓▓▓▓▓▓▓▓▓▓░░░░░░  MUM 62%             │  win probability bar
│                                         │
├─────────────────────────────────────────┤
│  THIS OVER   · 1 · 4 W ·                │  live over strip
├─────────────────────────────────────────┤
│  ● R Sharma   62 (41)  8×4 1×6  SR 151  │  batters
│    A Patel    23 (19)  2×4      SR 121  │
│  ─────────────────────────────────────  │
│  J Bumrah   3.3-0-28-2   ECON 8.00      │  bowler
├─────────────────────────────────────────┤
│  [Live] [Scorecard] [Charts] [Squads]   │  segmented tabs
├─────────────────────────────────────────┤
│                                         │
│   14.3  Bumrah to Sharma, FOUR!  ⚡      │  ball-by-ball feed
│   14.2  Bumrah to Sharma, 1 run         │  newest springs in at top
│   14.1  Bumrah to Patel, no run         │
│   ...                                   │
└─────────────────────────────────────────┘
```

---

## 2. Tabs

### Live (default)
Ball-by-ball feed, newest first. Each entry animates in with a spring. Boundary
and wicket entries get a coloured left rail and a larger typographic treatment.
Over breaks insert a summary divider: `End of over 14 · 12 runs · MUM 147-4`.

### Scorecard
Full batting card (batter, dismissal text, R, B, 4s, 6s, SR), extras breakdown,
fall of wickets ribbon, full bowling card (O, M, R, W, Econ, wd, nb). Both
innings, collapsible. Live-updating.

### Charts
- **Worm** — cumulative runs vs overs, both innings overlaid, wickets as dots.
- **Manhattan** — runs per over as bars, wickets as red markers.
- **Run rate comparison** — CRR vs RRR over time.
- **Partnership bars** — horizontal stacked, each batter's contribution.
- **Wagon wheel** — if the scorer used Advanced Mode; a circular field with
  shot lines coloured by runs. Filterable per batter.
- **Pitch map** — if available.

All Recharts, all animated on mount, all readable in both themes.

### Squads
Both XIs with photos, roles, and captain/keeper badges. Tap a player →
their profile and career stats.

---

## 3. Real-time

- Subscribe to `postgres_changes` on `deliveries` filtered by `match_id`, plus
  `innings` and `matches` for status changes.
- Optimistically append; reconcile on the authoritative row.
- Target latency scorer-tap → audience-render: **< 1.5s p95**.
- A `⟳ LIVE` pulse in the header shows the connection is healthy; it turns amber
  (`reconnecting`) then grey (`paused — tap to resume`) on failure, with an
  automatic exponential-backoff reconnect and a full refetch on recovery.
- When the tab is backgrounded for >5 min the socket closes; on return the app
  refetches and plays a short "you missed 18 balls" catch-up summary card.

---

## 4. Moments — the fun part

These are what make people keep the tab open.

| Event | Reaction |
|---|---|
| **FOUR** | Boundary rope glow sweeps the hero, "FOUR" wordmark scales in and fades, 350ms |
| **SIX** | Full-screen particle burst in the batting team's colour, hero pulses, ball-trail arc across the screen, 900ms |
| **WICKET** | Screen shake, deep red vignette, the dismissed batter's card flips over to show their final figures, 1.2s |
| **50 / 100** | Gold laurel sweep + the batter's photo scales up with their figures |
| **Maiden over** | "MAIDEN" stamp animates onto the over divider |
| **Hat-trick ball** | The hero border pulses gold and a "HAT-TRICK BALL" ribbon appears *before* the delivery |
| **Last over** | The hero shifts to a high-contrast "FINAL OVER" state with a per-ball countdown |
| **Match won** | Confetti in the winner's colours, result card, Player of the Match reveal |

All gated behind `prefers-reduced-motion` and a **"Calm mode"** toggle in the
header that strips every animation to a simple fade.

---

## 5. Win probability

v1 uses a transparent heuristic, clearly labelled *"estimate"* — not a black box.

```
Inputs: runsRequired, ballsRemaining, wicketsInHand, currentRunRate,
        parScoreForVenue (default = first-innings total)

baseline   = requiredRate vs a resource curve derived from wicketsInHand
resource   = wicketsRemaining-weighted fraction of balls left
prob(chase) = logistic( k1 * (parRate - requiredRate) + k2 * resource )
```

Constants tuned on historical matches in the app once enough data exists.
Before the first innings ends, the bar shows a simple par-score comparison
instead. The tooltip always explains the inputs.

---

## 6. Sharing and big-screen

- **Share sheet** produces an OG-image card (generated by an edge function):
  live score, team crests, the current over. Looks good pasted in WhatsApp.
- **Big Screen mode** (`?tv=1`): a 16:9 layout designed for a laptop plugged
  into a TV at the ground. Huge score, current over, ball feed on the right,
  auto-cycling between scorecard and charts. Kiosk-friendly, no chrome.
- **Follow a match**: logged-in users can follow; they get web push on wicket,
  50/100, and the result.

---

## 7. Completed match view

Same URL, same tabs, but:

- The hero becomes a result card: `MUM won by 6 wickets` with the winning
  team's colours and the Player of the Match.
- A **match replay scrubber** appears — drag through the innings and watch the
  score, worm chart, and batter cards animate to that point in time. This is
  purely a client-side replay of the delivery log and is the single most
  "futuristic" feature in the app.
- An `Edited` badge appears if any delivery was amended post-match, linking to
  the audit summary.

---

## 8. Performance

- Ball feed is virtualised past 60 entries (`@tanstack/react-virtual`).
- Charts are lazy-loaded per tab (`React.lazy`), not in the initial bundle.
- Particle effects use a single pooled canvas, destroyed after 2s idle.
- Hero aurora is a single GPU-composited element with `will-change: transform`.
- Target: **LCP < 1.8s on 4G**, initial JS < 180KB gzipped for the audience route.
- The audience route does **not** import the scoring engine's mutation paths,
  only its pure projection functions.
