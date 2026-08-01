---
description: Start a numbered build phase from the roadmap
argument-hint: <phase number, e.g. 1>
---

Start Phase $ARGUMENTS.

1. Read that phase's section in `docs/12-ROADMAP.md`, including its acceptance
   criteria.
2. Read the docs it references before writing code.
3. Confirm the previous phase's acceptance criteria actually pass. If they
   don't, stop and tell me — don't build on a broken foundation.
4. Plan the work, then build it.
5. Finish by running `/check` and reporting against the acceptance criteria
   honestly: what passes, what doesn't, what you skipped.

Reminders that apply to every phase:

- `src/engine/` stays pure — no React, no I/O, no DOM, no `Date.now()`, no
  `Math.random()`.
- The scorer view scrolls zero pixels.
- `deliveries` is append-only; undo means soft-delete plus replay.
- Docs are the spec. If the code and the docs disagree once you're in it, say so
  rather than silently picking one — the docs may be the thing that's wrong.
