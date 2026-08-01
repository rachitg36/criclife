---
description: Audit the cricket rules engine against the spec
argument-hint: (no arguments)
---

Audit `src/engine/` against `docs/04-RULES-ENGINE.md`. This is the code every
score in the app depends on, so be adversarial rather than reassuring.

Check specifically:

1. **Purity** — no React, network, DOM, `Date.now()` or `Math.random()`.
   Deterministic: replaying the same log twice must give identical state.
2. **Strike rotation** (§ 6) — the classic bug source. Verify: odd runs swap;
   boundaries don't; runs run off a wide swap; end-of-over swap applies *after*
   the ball's own swap; run-out end resolution uses `crossed`.
3. **Dismissal legality table** (§ 5.2) — every cell. Especially the free-hit
   row: only run out, obstructing the field, and hit-ball-twice are possible.
4. **Free hit persistence** — a wide does NOT consume a free hit; a legal
   delivery does.
5. **Bowler accounting** — byes and leg-byes are not charged to the bowler; a
   wide is not a ball faced by the batter; maidens disqualified by wides/no-balls.
6. **Config honoured** — `ballsPerOver` other than 6, `playersPerSide` other
   than 11, `lastManStanding`, `maxOversPerBowler`.
7. **Coverage** — 100% branches on `src/engine/`, and the three fixture matches
   replay to byte-identical scorecards.

Report anything wrong, plus anything correct-but-fragile. If you find nothing,
say so — but only after actually reading the code, not the tests.
