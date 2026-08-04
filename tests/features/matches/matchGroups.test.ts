import { describe, expect, it } from 'vitest';
import { groupMatches, resumeAction } from '@/features/matches/matchGroups';
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

  it('offers the scorecard for a completed match', () => {
    expect(resumeAction('completed')).toEqual({ label: 'Scorecard', path: 'scorecard' });
  });
});
