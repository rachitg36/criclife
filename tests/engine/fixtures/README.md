Fixtures live in `../fixtures.test.ts` — each is scored ball by ball with its
expected scorecard worked out by hand, then replayed through `replay()` and
compared for byte-identical equality.

This directory is kept only so the layout matches `docs/04-RULES-ENGINE.md`
§ 12, which refers to `tests/engine/fixtures`.
