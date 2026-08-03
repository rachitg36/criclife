import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/engine/config';
import { buildFeed, resolveNames, type FeedItem } from '../../../src/features/audience/feed';
import { logged, overOf } from './helpers';
import type { AudienceDelivery } from '../../../src/features/audience/types';

const NAMES: Record<string, string> = {
  b1: 'J Bumrah',
  s1: 'R Sharma',
  ns1: 'A Patel',
};
const nameOf = (id: string) => NAMES[id] ?? id;

function feed(deliveries: AudienceDelivery[]): FeedItem[] {
  return buildFeed({
    deliveries,
    config: DEFAULT_CONFIG,
    nameOf,
    teamCodeOf: (id) => (id === 'teamA' ? 'MUM' : 'CHE'),
    battingTeamOf: (no) => (no === 1 ? 'teamA' : 'teamB'),
  });
}

describe('resolveNames', () => {
  it('substitutes player ids in engine-generated commentary', () => {
    expect(resolveNames('b1 to s1, FOUR!', nameOf, ['b1', 's1'])).toBe('J Bumrah to R Sharma, FOUR!');
  });

  it('leaves text alone when no ids are supplied', () => {
    expect(resolveNames('b1 to s1', nameOf, [])).toBe('b1 to s1');
  });

  it('skips empty ids rather than replacing every character', () => {
    expect(resolveNames('b1 to s1', nameOf, ['', 'b1'])).toBe('J Bumrah to s1');
  });
});

describe('buildFeed', () => {
  it('is empty for an empty log', () => {
    expect(feed([])).toEqual([]);
  });

  it('returns newest first', () => {
    const items = feed([
      logged({ overNo: 0, ballInOver: 1, commentary: 'first' }),
      logged({ overNo: 0, ballInOver: 2, commentary: 'second' }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'ball', text: 'second' });
    expect(items[1]).toMatchObject({ kind: 'ball', text: 'first' });
  });

  it('labels a ball with over.ball', () => {
    const items = feed([logged({ overNo: 14, ballInOver: 3 })]);
    expect(items[0]).toMatchObject({ kind: 'ball', label: '14.3' });
  });

  it('does not close an incomplete over — there is no "end of over" yet', () => {
    const items = feed(overOf(3, 0));
    expect(items.some((i) => i.kind === 'over')).toBe(false);
  });

  it('closes a completed over with the running score', () => {
    const items = feed([...overOf(5, 0), logged({ overNo: 0, ballInOver: 6, runsBatter: 4 })]);
    const divider = items.find((i) => i.kind === 'over');
    expect(divider).toMatchObject({
      kind: 'over',
      overNumber: 1,
      runs: 4,
      wickets: 0,
      maiden: false,
      scoreAfter: { runs: 4, wickets: 0 },
    });
  });

  it('marks a genuine maiden', () => {
    const divider = feed(overOf(6, 0)).find((i) => i.kind === 'over');
    expect(divider).toMatchObject({ maiden: true, runs: 0 });
  });

  it('still counts an over of leg byes as a maiden — the bowler conceded nothing', () => {
    const balls = overOf(6, 0).map((b, i) =>
      i < 4 ? { ...b, extraType: 'leg_bye' as const, runsExtras: 1, runsTotal: 1 } : b
    );
    const divider = feed(balls).find((i) => i.kind === 'over');
    expect(divider).toMatchObject({ maiden: true, runs: 4 });
  });

  it('is not a maiden when the bowler concedes a wide', () => {
    const balls = [
      ...overOf(6, 0),
      logged({ overNo: 0, extraType: 'wide', isLegal: false, runsExtras: 1 }),
    ];
    // The wide arrives after six legal balls only in this synthetic log; what
    // matters is that a bowler-charged extra kills the maiden.
    const divider = feed(balls).find((i) => i.kind === 'over');
    expect(divider).toMatchObject({ maiden: false });
  });

  it('counts wickets in the over divider but ignores a retired hurt', () => {
    const balls = [
      ...overOf(4, 0),
      logged({ overNo: 0, ballInOver: 5, isWicket: true, wicketType: 'bowled', dismissedPlayerId: 's1' }),
      logged({
        overNo: 0,
        ballInOver: 6,
        isWicket: true,
        wicketType: 'retired_hurt',
        dismissedPlayerId: 'ns1',
      }),
    ];
    expect(feed(balls).find((i) => i.kind === 'over')).toMatchObject({ wickets: 1 });
  });

  it('inserts an innings divider and restarts the running score', () => {
    const balls = [
      ...overOf(6, 0, { runsBatter: 1 }),
      logged({ inningsNo: 2, overNo: 0, ballInOver: 1, runsBatter: 2 }),
    ];
    const items = feed(balls);
    const inningsDivider = items.find((i) => i.kind === 'innings');
    expect(inningsDivider).toMatchObject({
      kind: 'innings',
      text: 'End of innings 1 · MUM 6-0',
    });
  });

  it('tags accents so the feed can rail-colour them', () => {
    const items = feed([
      logged({ overNo: 0, ballInOver: 1, runsBatter: 4, isBoundaryFour: true }),
      logged({ overNo: 0, ballInOver: 2, runsBatter: 6, isBoundarySix: true }),
      logged({ overNo: 0, ballInOver: 3, extraType: 'wide', isLegal: false, runsExtras: 1 }),
      logged({
        overNo: 0,
        ballInOver: 3,
        isWicket: true,
        wicketType: 'caught',
        dismissedPlayerId: 's1',
      }),
    ]);
    expect(items.map((i) => (i.kind === 'ball' ? i.accent : null))).toEqual([
      'wicket',
      'extra',
      'six',
      'four',
    ]);
  });

  it('resolves player ids in the commentary it renders', () => {
    const items = feed([logged({ commentary: 'b1 to s1, FOUR! finds the gap' })]);
    expect(items[0]).toMatchObject({ text: 'J Bumrah to R Sharma, FOUR! finds the gap' });
  });
});
