import { describe, expect, it } from 'vitest';
import { isFinishedStatus } from '@/features/audience/feed';
import type { MatchStatus } from '@/engine/types';

/**
 * The safety-net poll's stop condition, pinned on its own.
 *
 * Realtime has never been observed carrying a message in this project —
 * migration 20260803180000's header records `postgres_changes` subscriptions
 * being silently inert for two entire phases, looking healthy the whole time.
 * Every refetch on the audience route hung off a Realtime event, so an
 * inert-but-SUBSCRIBED socket froze the view on a screen still saying "live".
 * Reported as "the live feed was not updating".
 *
 * The tempting version of the gate — poll only while `live` — is wrong in the
 * ordinary case, which is why it is worth a test rather than a glance: a
 * spectator who opens the link before the toss sees a `scheduled` match, and
 * would sit on a dead page for the whole game.
 */
describe('audience poll gate', () => {
  const keepsPolling: MatchStatus[] = ['scheduled', 'toss', 'live', 'innings_break', 'super_over'];
  const stops: MatchStatus[] = ['completed', 'abandoned'];

  it.each(keepsPolling)('keeps polling while %s — the match can still change', (status) => {
    expect(isFinishedStatus(status)).toBe(false);
  });

  it.each(stops)('stops once %s — no further ball can arrive', (status) => {
    expect(isFinishedStatus(status)).toBe(true);
  });

  it('keeps polling when the status is not known yet', () => {
    // Before the match row lands, "unknown" must not read as "finished" —
    // that would stop the poll permanently on the very first tick.
    expect(isFinishedStatus(undefined)).toBe(false);
  });
});
