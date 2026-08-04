import { describe, expect, it } from 'vitest';
import { groupMatches, mineOnly, resumeAction } from '@/features/matches/matchGroups';
import type { MatchStatus } from '@/engine/types';

/**
 * "If a live match is going on, I should be able to go back to it any time.
 * When I click on matches it takes me to create a new match, and the live
 * match is completely lost."
 *
 * `/matches` was a Phase 0 stub and the ⊕ tab pointed at `/matches/new`, so
 * there was no route back to a match in progress.
 */
const m = (status: MatchStatus, scheduled_at: string | null = null) => ({ status, scheduled_at });

describe('groupMatches', () => {
  it('puts every in-progress status in "live"', () => {
    const { live } = groupMatches([m('live'), m('innings_break'), m('super_over')]);
    expect(live).toHaveLength(3);
  });

  it('counts a match that has had its toss as upcoming, not finished', () => {
    // `toss` is the status a match sits in between setup and the first ball —
    // exactly where one was stranded tonight.
    const { upcoming, finished } = groupMatches([m('scheduled'), m('toss')]);
    expect(upcoming).toHaveLength(2);
    expect(finished).toHaveLength(0);
  });

  it('treats abandoned as finished rather than dropping it', () => {
    const { finished } = groupMatches([m('completed'), m('abandoned')]);
    expect(finished).toHaveLength(2);
  });

  it('orders each group newest first', () => {
    const { finished } = groupMatches([
      m('completed', '2026-01-01T00:00:00Z'),
      m('completed', '2026-08-01T00:00:00Z'),
      m('completed', '2026-04-01T00:00:00Z'),
    ]);
    expect(finished.map((x) => x.scheduled_at)).toEqual([
      '2026-08-01T00:00:00Z',
      '2026-04-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
    ]);
  });

  it('sorts an undated match last instead of to the top', () => {
    const { upcoming } = groupMatches([
      m('scheduled', null),
      m('scheduled', '2026-01-01T00:00:00Z'),
    ]);
    expect(upcoming[0]?.scheduled_at).toBe('2026-01-01T00:00:00Z');
    expect(upcoming[1]?.scheduled_at).toBeNull();
  });

  it('handles an empty list', () => {
    expect(groupMatches([])).toEqual({ live: [], upcoming: [], finished: [] });
  });
});

describe('resumeAction', () => {
  it('offers scoring for a match in progress — the whole point of the screen', () => {
    expect(resumeAction('live')).toEqual({ label: 'Resume scoring', path: 'score' });
    expect(resumeAction('innings_break').path).toBe('score');
    expect(resumeAction('super_over').path).toBe('score');
  });

  it('offers setup for one that has not started', () => {
    expect(resumeAction('scheduled')).toEqual({ label: 'Set up', path: 'setup' });
    expect(resumeAction('toss').path).toBe('setup');
  });

  it('sends a finished match to its hub, not to the scorecard stub', () => {
    // /matches/:matchId/scorecard is still a Phase 0 placeholder, and the real
    // scorecard is the audience view — which needs a public_slug this function
    // does not have. The hub knows it and links through.
    expect(resumeAction('completed')).toEqual({ label: 'Result', path: '' });
    expect(resumeAction('abandoned').path).toBe('');
  });
});

describe('mineOnly', () => {
  // The live bar read "9 matches in progress" on a phone whose owner had two
  // teams. Every match is world-readable — correct for a live score — so an
  // unfiltered count includes games this person has nothing to do with.
  const match = (a: string, b: string) => ({ team_a_id: a, team_b_id: b });

  it('keeps a match where either side is mine', () => {
    expect(mineOnly([match('t1', 'x')], ['t1'])).toHaveLength(1);
    expect(mineOnly([match('x', 't1')], ['t1'])).toHaveLength(1);
  });

  it('drops a match between two teams I have nothing to do with', () => {
    expect(mineOnly([match('x', 'y')], ['t1', 't2'])).toEqual([]);
  });

  it('shows nothing at all to someone with no teams', () => {
    // Not "everything": a signed-in stranger must not be told to resume
    // somebody else's game.
    expect(mineOnly([match('x', 'y')], [])).toEqual([]);
  });

  it('keeps a match between two of my own teams exactly once', () => {
    expect(mineOnly([match('t1', 't2')], ['t1', 't2'])).toHaveLength(1);
  });
});
