import { describe, expect, it } from 'vitest';
import { setupProgress } from '@/features/matches/setupProgress';

/**
 * Written after match setup made somebody do it twice.
 *
 * "Start match" was gated on the toss alone, sat below the fold under two
 * squad sections, and on failure showed the server's raw `XI_REQUIRED: …`.
 * Filling in the first team's squad and stopping looked exactly like being
 * finished — and the hub's next button, "Continue setup", led straight back
 * to the screen you had just left.
 */
const base = {
  tossWinnerTeamId: 'team-a',
  squadACount: 3,
  squadBCount: 3,
  teamAName: 'TM1',
  teamBName: 'TM2',
};

describe('setupProgress', () => {
  it('lets a fully set-up match start', () => {
    const p = setupProgress(base);
    expect(p.canStart).toBe(true);
    expect(p.blocker).toBeNull();
  });

  it('holds the match until the toss is confirmed', () => {
    const p = setupProgress({ ...base, tossWinnerTeamId: null });
    expect(p.canStart).toBe(false);
    expect(p.blocker).toBe('Confirm the toss first.');
  });

  it('names the side that still has no squad, by its real name', () => {
    // The exact case: Team A done, Team B untouched, and previously the only
    // feedback was a server round trip saying "XI_REQUIRED".
    const p = setupProgress({ ...base, squadBCount: 0 });
    expect(p.canStart).toBe(false);
    expect(p.blocker).toBe('Pick a squad for TM2 first.');
    expect(p.aReady).toBe(true);
    expect(p.bReady).toBe(false);
  });

  it('asks for one thing at a time, in the order the screen shows them', () => {
    const p = setupProgress({
      ...base,
      tossWinnerTeamId: null,
      squadACount: 0,
      squadBCount: 0,
    });
    expect(p.blocker).toBe('Confirm the toss first.');
  });

  it('accepts a short side — playersPerSide is a cap, not a quota', () => {
    // Sides turn up short. `start_innings` asks only whether a squad exists,
    // and this must not be stricter than the server it mirrors.
    const p = setupProgress({ ...base, squadACount: 1, squadBCount: 2 });
    expect(p.canStart).toBe(true);
  });

  it('treats an undefined count the same as none — a query in flight is not readiness', () => {
    const p = setupProgress({ ...base, tossWinnerTeamId: undefined, squadACount: 0 });
    expect(p.tossSet).toBe(false);
    expect(p.canStart).toBe(false);
  });
});
