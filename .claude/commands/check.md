---
description: Run the full quality gate
argument-hint: (no arguments)
---

Run these in order and report a short pass/fail table:

```
npm run typecheck
npm run lint
npm run test
npm run build
npm run size
npm run test:e2e
```

If anything fails, fix it and re-run. Report what broke and what you changed.
Do not describe a partial pass as green.
