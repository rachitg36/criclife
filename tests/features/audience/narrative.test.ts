import { describe, expect, it } from 'vitest';
import { buildNarrative } from '@/features/audience/narrative';
import { DEFAULT_CONFIG } from '@/engine/config';
import type { InningsState, MatchResult } from '@/engine/types';

/**
 * The match, in words.
 *
 * The risk with generated prose is not that it fails to appear — it is that it
 * appears and overclaims. So these tests are mostly about *silence*: a
 * one-wicket spell gets no sentence, a comfortable win gets no sentence, and a
 * super over is kept out of the innings summaries entirely because a one-over
 * innings has no scale worth describing.
 */
const config = { ...DEFAULT_CONFIG, oversPerInnings: 20, ballsPerOver: 6 };
const nameOfTeam = (id: string) => ({ A: 'Cologne', B: 'Bonn' })[id] ?? id;
const nameOfPlayer = (id: string) => ({ p1: 'Rahul', p2: 'Ben', b1: 'Arjun' })[id] ?? id;

function innings(over: Partial<InningsState>): InningsState {
  return {
    inningsNo: 1,
    battingTeamId: 'A',
    bowlingTeamId: 'B',
    isSuperOver: false,
    status: 'completed',
    runs: 0,
    wickets: 0,
    legalBalls: 120,
    target: null,
    batters: {},
    bowlers: {},
    ...(over as object),
  } as unknown as InningsState;
}

const won = (marginRuns: number | null, marginWickets: number | null): MatchResult => ({
  type: 'win',
  winnerTeamId: 'B',
  marginRuns,
  marginWickets,
  text: 'x',
});

describe('buildNarrative', () => {
  it('opens by naming who batted first and against whom', () => {
    const lines = buildNarrative({
      innings: [innings({ runs: 140, wickets: 6 })],
      config,
      result: null,
      nameOfTeam,
      nameOfPlayer,
    });
    expect(lines[0]).toBe('Cologne batted first against Bonn.');
  });

  it('names a top scorer worth naming', () => {
    const lines = buildNarrative({
      innings: [
        innings({
          runs: 140,
          wickets: 6,
          batters: {
            p1: { runs: 64, status: 'not_out' },
            p2: { runs: 12, status: 'out' },
          } as unknown as InningsState['batters'],
        }),
      ],
      config,
      result: null,
      nameOfTeam,
      nameOfPlayer,
    });
    expect(lines[1]).toContain('Rahul top-scoring with 64 not out');
  });

  it('says nothing about a top scorer who made 8', () => {
    const lines = buildNarrative({
      innings: [
        innings({
          runs: 40,
          wickets: 9,
          batters: { p1: { runs: 8, status: 'out' } } as unknown as InningsState['batters'],
        }),
      ],
      config,
      result: null,
      nameOfTeam,
      nameOfPlayer,
    });
    expect(lines[1]).toBe('Cologne made 40-9 from 20.0 overs.');
  });

  it('calls a chase finished with two balls left what it was', () => {
    const lines = buildNarrative({
      innings: [
        innings({ runs: 140, wickets: 6 }),
        innings({
          inningsNo: 2,
          battingTeamId: 'B',
          bowlingTeamId: 'A',
          runs: 141,
          wickets: 8,
          legalBalls: 118,
          target: 141,
        }),
      ],
      config,
      result: won(null, 2),
      nameOfTeam,
      nameOfPlayer,
    });
    expect(lines.join(' ')).toContain('Bonn chased 141 down with 2 balls to spare');
    expect(lines.join(' ')).toContain('It went to the wire.');
  });

  it('says how far short a side fell', () => {
    const lines = buildNarrative({
      innings: [
        innings({ runs: 140, wickets: 6 }),
        innings({
          inningsNo: 2,
          battingTeamId: 'B',
          bowlingTeamId: 'A',
          runs: 118,
          wickets: 10,
          target: 141,
        }),
      ],
      config,
      result: won(22, null),
      nameOfTeam,
      nameOfPlayer,
    });
    expect(lines.join(' ')).toContain('Bonn fell 22 runs short.');
    // 22 runs is not the wire. No manufactured drama.
    expect(lines.join(' ')).not.toContain('wire');
  });

  it('names a bowler with three wickets and ignores one with a single', () => {
    const withBowler = (wickets: number) =>
      innings({
        runs: 90,
        wickets,
        bowlers: {
          b1: { wickets, runsConceded: 21 },
        } as unknown as InningsState['bowlers'],
      });

    expect(
      buildNarrative({
        innings: [withBowler(3)],
        config,
        result: null,
        nameOfTeam,
        nameOfPlayer,
      }).join(' ')
    ).toContain('Arjun was the pick of the bowlers with 3 for 21');

    expect(
      buildNarrative({
        innings: [withBowler(1)],
        config,
        result: null,
        nameOfTeam,
        nameOfPlayer,
      }).join(' ')
    ).not.toContain('pick of the bowlers');
  });

  it('keeps super overs out of the innings summaries', () => {
    const lines = buildNarrative({
      innings: [
        innings({ runs: 60, wickets: 5 }),
        innings({ inningsNo: 2, battingTeamId: 'B', bowlingTeamId: 'A', runs: 60, wickets: 7 }),
        innings({ inningsNo: 3, isSuperOver: true, runs: 11, legalBalls: 6 }),
        innings({
          inningsNo: 4,
          isSuperOver: true,
          battingTeamId: 'B',
          bowlingTeamId: 'A',
          runs: 12,
          legalBalls: 6,
        }),
      ],
      config,
      result: { type: 'super_over_win', winnerTeamId: 'B', marginRuns: 1, marginWickets: null, text: 'x' },
      nameOfTeam,
      nameOfPlayer,
    });
    // Two innings summaries, not four — a one-over innings has no scale.
    expect(lines.filter((l) => l.includes('made'))).toHaveLength(2);
    expect(lines.join(' ')).toContain('It took a super over to separate them, and Bonn');
  });

  it('says nothing at all about a match with no innings', () => {
    expect(
      buildNarrative({ innings: [], config, result: null, nameOfTeam, nameOfPlayer })
    ).toEqual([]);
  });
});
