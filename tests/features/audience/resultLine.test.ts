import { describe, expect, it } from 'vitest';
import { resolveResultLine } from '@/features/audience/feed';

/**
 * What the audience view prints once a match is over.
 *
 * Two complaints, one gap. "It was not clearly shown who won the match" — and,
 * separately, a request that an abandoned match say so with its reason. Both
 * came down to the same thing: nothing on the audience route ever fetched
 * `matches.result_text`, which is the *only* place either sentence exists.
 * `complete_match` writes the result there; `abandon_match` writes the reason
 * there. The hero fell back to a bare "Match complete" for both.
 *
 * The engine cannot supply either. A match called off mid-chase has no engine
 * result at all — the delivery log never implied one — so for an abandoned
 * match `result` is null by construction, not by accident.
 */
describe('audience result line', () => {
  it('shows the abandonment reason the scorer typed', () => {
    expect(resolveResultLine('Rain — no result', null)).toBe('Rain — no result');
  });

  it('falls back to abandon_match default when no reason was given', () => {
    // `abandon_match` coalesces an empty reason to this, so `result_text` is
    // never null for an abandoned match.
    expect(resolveResultLine('Match abandoned', null)).toBe('Match abandoned');
  });

  it("prefers the server's sentence over the engine's for a normal result", () => {
    // The engine's text carries team *ids*; the server's carries names.
    expect(resolveResultLine('Bonn won by 4 wickets', 'team-b-uuid won by 4 wickets')).toBe(
      'Bonn won by 4 wickets'
    );
  });

  it('still uses the engine result if the server has not written one yet', () => {
    // The gap between the last ball and `complete_match` returning.
    expect(resolveResultLine(null, 'Match tied')).toBe('Match tied');
  });

  it('never renders an empty result', () => {
    expect(resolveResultLine(null, null)).toBe('Match complete');
  });
});
