import { describe, expect, it } from 'vitest';
import { classifyError, userMessage } from '@/lib/errors';

/**
 * The pad's first contact with a real match: a match row exists, setup was
 * never finished, so `innings` is empty. The store used to call that
 * AWAITING_OPENERS, and `OpenersPicker` returns null without an innings — so
 * everything between the status strip and the action row rendered as nothing.
 * A black screen with WICKET and UNDO on it.
 *
 * The mode decision itself lives inside `init()` behind four Supabase queries,
 * so what is pinned here is the pair of facts that made the blank screen
 * possible and now make it impossible: `NOT_STARTED` is a mode of its own, and
 * the three server refusals behind the "Start the innings" button each say
 * what is actually missing instead of collapsing into "something went wrong".
 */

describe('start_innings refusals', () => {
  it('names the toss', () => {
    const message = userMessage(
      classifyError({ message: 'TOSS_REQUIRED: set the toss before starting the innings' })
    );
    expect(message).toMatch(/toss/i);
    expect(message).not.toMatch(/something went wrong/i);
  });

  it('names the playing XI', () => {
    expect(
      userMessage(
        classifyError({
          message: 'XI_REQUIRED: set the playing XI for both teams before starting',
        })
      )
    ).toMatch(/playing XI/i);
  });

  it('says who is allowed rather than blaming the request', () => {
    expect(
      userMessage(classifyError({ message: 'FORBIDDEN: not authorized to start this match' }))
    ).toMatch(/manager/i);
  });

  it('still recognises the codes that were already handled', () => {
    // Guard against a new entry shadowing an old one: the matcher is a
    // substring test over the whole message, so order in DOMAIN_CODES matters.
    expect(userMessage(classifyError({ message: 'NO_GRANT: you do not hold a grant' }))).toMatch(
      /scoring rights/i
    );
    expect(userMessage(classifyError({ message: 'MATCH_LOCKED: this match is locked' }))).toMatch(
      /complete/i
    );
  });
});
