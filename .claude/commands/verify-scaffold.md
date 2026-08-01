---
description: Install dependencies and get the Phase 0 scaffold fully green
argument-hint: (no arguments)
---

The Phase 0 scaffold in this repo was written without npm registry access, so it
has **never been installed, compiled or run**. See `HANDOFF.md` § 3.

Close it out:

1. `npm install`. If resolution fails, fix the offending version in
   `package.json` — pins were best-effort, not resolved against the registry.
2. `npm run typecheck`. Expect errors from `exactOptionalPropertyTypes` and
   `noUncheckedIndexedAccess`, both of which are on deliberately. Fix the code,
   not the tsconfig — unless a flag is clearly costing more than it's worth, in
   which case say so and explain why.
3. `npm run lint` — zero warnings allowed.
4. `npm run test`.
5. `npm run build`.
6. `npm run test:e2e` — this includes the no-scroll gate at four viewports. If
   the scoring shell overflows, fix the layout, never the budget.
7. `npx husky init` if you keep the `prepare` script, or remove the script.

Known likely trouble spots, in order: Tailwind v4 + `@tailwindcss/vite` and the
`@theme inline` bridge in `globals.css`; the `motion/react` import path; React
Router v7's API surface; `virtual:pwa-register` types.

When you're done, report **what you actually had to change and why** — one list,
no padding. If anything in the scaffold looks wrong rather than just outdated,
say so plainly.
