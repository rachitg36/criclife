import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { buildBattingCard, buildBowlingCard } from '../../src/engine/scorecard';
import { emptyInnings } from './helpers';

describe('buildBattingCard', () => {
  it('strike rate is null before facing a ball, and a dismissal has no text when not out', () => {
    const innings = emptyInnings({
      batters: {
        p1: { playerId: 'p1', position: 1, runs: 0, balls: 0, fours: 0, sixes: 0, status: 'not_out', dismissal: null },
      },
    });
    const [row] = buildBattingCard(innings);
    expect(row!.strikeRate).toBeNull();
    expect(row!.dismissalText).toBeNull();
  });

  it('strike rate and dismissal text are populated once out', () => {
    const innings = emptyInnings({
      batters: {
        p1: {
          playerId: 'p1',
          position: 1,
          runs: 50,
          balls: 40,
          fours: 4,
          sixes: 1,
          status: 'out',
          dismissal: {
            type: 'bowled',
            dismissedPlayerId: 'p1',
            bowlerId: 'bowler1',
            fielderId: null,
            assistFielderId: null,
            text: 'b bowler1',
          },
        },
      },
    });
    const [row] = buildBattingCard(innings);
    expect(row!.strikeRate).toBe(125);
    expect(row!.dismissalText).toBe('b bowler1');
  });
});

describe('buildBowlingCard', () => {
  it('economy is null before a legal ball has been bowled', () => {
    const innings = emptyInnings({
      bowlers: {
        b1: {
          playerId: 'b1',
          legalBalls: 0,
          runsConceded: 4,
          wickets: 0,
          wides: 4,
          noBalls: 0,
          dots: 0,
          maidens: 0,
        },
      },
    });
    const [row] = buildBowlingCard(innings, DEFAULT_CONFIG);
    expect(row!.economy).toBeNull();
  });

  it('economy is runs conceded per over once legal balls have been bowled', () => {
    const innings = emptyInnings({
      bowlers: {
        b1: {
          playerId: 'b1',
          legalBalls: 12,
          runsConceded: 12,
          wickets: 1,
          wides: 0,
          noBalls: 0,
          dots: 6,
          maidens: 0,
        },
      },
    });
    const [row] = buildBowlingCard(innings, DEFAULT_CONFIG);
    expect(row!.economy).toBe(6);
    expect(row!.oversDisplay).toBe('2.0');
  });
});
