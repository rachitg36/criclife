import { CREDIT_TABLE } from '@/engine';
import type { MatchConfig, PlayerId } from '@/engine/types';
import type { AudienceDelivery } from './types';

/**
 * docs/06-AUDIENCE-VIEW.md § 2 "Charts" — every series the charts tab draws,
 * derived from nothing but the delivery log. Pure, so each one is unit-testable
 * without rendering anything.
 *
 * DEVIATION FROM docs/01-TECH-STACK.md, flagged rather than made silently:
 * docs/01 names **Recharts** for these. They are drawn with hand-rolled SVG
 * instead, and no charting dependency was added. Four of the five are a
 * polyline or a row of rects; the wagon wheel and pitch map were always going
 * to be hand-rolled SVG (docs/01 says so itself). Recharts is ~100 kB gzipped
 * for that, on a route whose stated bar is "LCP < 1.8s on 4G" and "initial JS
 * < 180 kB" (docs/06 § 8) — and CLAUDE.md rule 7 forbids hardcoded colours, so
 * every series would have had to be fed `var(--…)` strings through Recharts'
 * props anyway. See HANDOFF.md § 6.4. If a chart shows up later that genuinely
 * needs a chart library, this is the moment to revisit.
 */

function countsAsWicket(d: AudienceDelivery): boolean {
  return d.isWicket && d.wicketType !== null && CREDIT_TABLE[d.wicketType].countsAsWicket;
}

export type WormPoint = {
  /** Fractional overs — 8.3 means three balls into the ninth over. */
  overs: number;
  runs: number;
};

export type WormWicket = WormPoint & { playerId: PlayerId };

export type WormSeries = {
  inningsNo: number;
  battingTeamId: string;
  points: WormPoint[];
  wickets: WormWicket[];
};

function oversFromBalls(legalBalls: number, ballsPerOver: number): number {
  return legalBalls / ballsPerOver;
}

/** Cumulative runs against overs faced, per innings, with wickets as dots. */
export function buildWorm(
  deliveries: readonly AudienceDelivery[],
  config: MatchConfig,
  battingTeamOf: (inningsNo: number) => string
): WormSeries[] {
  const byInnings = new Map<number, WormSeries>();

  let runs = 0;
  let legalBalls = 0;
  let current: number | null = null;

  for (const d of deliveries) {
    if (d.inningsNo !== current) {
      current = d.inningsNo;
      runs = 0;
      legalBalls = 0;
      byInnings.set(d.inningsNo, {
        inningsNo: d.inningsNo,
        battingTeamId: battingTeamOf(d.inningsNo),
        // Every worm starts at the origin so two innings overlay honestly.
        points: [{ overs: 0, runs: 0 }],
        wickets: [],
      });
    }
    const series = byInnings.get(d.inningsNo)!;

    runs += d.runsTotal;
    if (d.isLegal) legalBalls += 1;
    const overs = oversFromBalls(legalBalls, config.ballsPerOver);

    series.points.push({ overs, runs });
    if (countsAsWicket(d) && d.dismissedPlayerId) {
      series.wickets.push({ overs, runs, playerId: d.dismissedPlayerId });
    }
  }

  return [...byInnings.values()].sort((a, b) => a.inningsNo - b.inningsNo);
}

export type ManhattanBar = {
  /** 1-based, for display. */
  overNumber: number;
  runs: number;
  wickets: number;
};

export type ManhattanSeries = {
  inningsNo: number;
  battingTeamId: string;
  bars: ManhattanBar[];
};

/** Runs per over as bars, wickets as markers. */
export function buildManhattan(
  deliveries: readonly AudienceDelivery[],
  battingTeamOf: (inningsNo: number) => string
): ManhattanSeries[] {
  const byInnings = new Map<number, Map<number, ManhattanBar>>();

  for (const d of deliveries) {
    let overs = byInnings.get(d.inningsNo);
    if (!overs) {
      overs = new Map();
      byInnings.set(d.inningsNo, overs);
    }
    let bar = overs.get(d.overNo);
    if (!bar) {
      bar = { overNumber: d.overNo + 1, runs: 0, wickets: 0 };
      overs.set(d.overNo, bar);
    }
    bar.runs += d.runsTotal;
    if (countsAsWicket(d)) bar.wickets += 1;
  }

  return [...byInnings.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([inningsNo, overs]) => ({
      inningsNo,
      battingTeamId: battingTeamOf(inningsNo),
      bars: [...overs.entries()].sort((a, b) => a[0] - b[0]).map(([, bar]) => bar),
    }));
}

export type RunRatePoint = {
  overNumber: number;
  /** Runs per over the batting side has actually managed, to the end of this over. */
  crr: number;
  /** `null` in the first innings, and once the target is passed. */
  rrr: number | null;
};

export type RunRateSeries = {
  inningsNo: number;
  battingTeamId: string;
  points: RunRatePoint[];
};

/**
 * CRR against RRR over time. RRR only exists once there is something to chase,
 * so the first innings' series carries `null` throughout rather than a
 * fabricated line.
 */
export function buildRunRate(
  deliveries: readonly AudienceDelivery[],
  config: MatchConfig,
  battingTeamOf: (inningsNo: number) => string,
  targetOf: (inningsNo: number) => number | null,
  oversOf: (inningsNo: number) => number
): RunRateSeries[] {
  const out: RunRateSeries[] = [];
  const byInnings = new Map<number, AudienceDelivery[]>();
  for (const d of deliveries) {
    const list = byInnings.get(d.inningsNo);
    if (list) list.push(d);
    else byInnings.set(d.inningsNo, [d]);
  }

  for (const [inningsNo, list] of [...byInnings.entries()].sort((a, b) => a[0] - b[0])) {
    const target = targetOf(inningsNo);
    const totalBalls = oversOf(inningsNo) * config.ballsPerOver;
    const points: RunRatePoint[] = [];

    let runs = 0;
    let legalBalls = 0;
    let over: number | null = null;
    let overLegalBalls = 0;

    const push = (overNo: number) => {
      const crr = legalBalls > 0 ? runs / (legalBalls / config.ballsPerOver) : 0;
      let rrr: number | null = null;
      if (target !== null) {
        const need = target - runs;
        const ballsLeft = totalBalls - legalBalls;
        rrr = need > 0 && ballsLeft > 0 ? need / (ballsLeft / config.ballsPerOver) : null;
      }
      points.push({ overNumber: overNo + 1, crr, rrr });
    };

    for (const d of list) {
      if (over !== null && d.overNo !== over) {
        push(over);
        overLegalBalls = 0;
      }
      over = d.overNo;
      runs += d.runsTotal;
      if (d.isLegal) {
        legalBalls += 1;
        overLegalBalls += 1;
      }
    }
    // Only plot the final over once it is complete; a point drawn three balls
    // into an over reads as a rate collapse that never happened.
    if (over !== null && overLegalBalls === config.ballsPerOver) push(over);

    out.push({ inningsNo, battingTeamId: battingTeamOf(inningsNo), points });
  }

  return out;
}

export type PartnershipBar = {
  wicketNumber: number;
  runs: number;
  legalBalls: number;
  /** The two batters, with what each of them contributed to this stand. */
  batters: { playerId: PlayerId; runs: number; balls: number }[];
  /** `true` for the stand still going. */
  unbroken: boolean;
};

/**
 * Horizontal stacked bars, each batter's contribution shown separately —
 * which is why this reads the ball-by-ball log rather than the engine's
 * `buildPartnerships`. That one works off `fallOfWickets` deltas and says so:
 * it can report what a completed stand was worth, but not who the two batters
 * were or how the runs split between them.
 */
export function buildPartnershipBars(
  deliveries: readonly AudienceDelivery[],
  inningsNo: number
): PartnershipBar[] {
  const bars: PartnershipBar[] = [];
  let current: PartnershipBar | null = null;
  let wicketNumber = 1;

  const contribution = (bar: PartnershipBar, playerId: PlayerId) => {
    let entry = bar.batters.find((b) => b.playerId === playerId);
    if (!entry) {
      entry = { playerId, runs: 0, balls: 0 };
      bar.batters.push(entry);
    }
    return entry;
  };

  for (const d of deliveries) {
    if (d.inningsNo !== inningsNo) continue;

    if (!current) {
      current = { wicketNumber, runs: 0, legalBalls: 0, batters: [], unbroken: true };
    }

    current.runs += d.runsTotal;
    if (d.isLegal) current.legalBalls += 1;

    // Only runs off the bat belong to a batter. Extras count toward the stand
    // (they are runs the pair put on) but to neither batter's contribution.
    const striker = contribution(current, d.strikerId);
    striker.runs += d.runsBatter;
    // A wide is not a ball faced; everything else legal or not is.
    if (d.extraType !== 'wide') striker.balls += 1;
    // Make sure the non-striker appears in the bar even if they never faced.
    contribution(current, d.nonStrikerId);

    if (countsAsWicket(d)) {
      current.unbroken = false;
      bars.push(current);
      wicketNumber += 1;
      current = null;
    }
  }

  if (current) bars.push(current);
  return bars;
}

export type WagonShot = {
  key: string;
  playerId: PlayerId;
  /** Normalised field coordinates, -1..1, as captured in Advanced Mode. */
  x: number;
  y: number;
  runs: number;
};

/**
 * Shot lines for the wagon wheel. Only balls the scorer captured coordinates
 * for in Advanced Mode (docs/05 § 8, off by default) have any, so this is
 * usually empty — the chart is responsible for saying so rather than drawing
 * an empty field and looking broken.
 */
export function buildWagonWheel(
  deliveries: readonly AudienceDelivery[],
  inningsNo: number,
  batterId: PlayerId | null = null
): WagonShot[] {
  const out: WagonShot[] = [];
  for (const d of deliveries) {
    if (d.inningsNo !== inningsNo) continue;
    if (!d.shot) continue;
    if (batterId && d.strikerId !== batterId) continue;
    if (d.runsBatter === 0) continue;
    out.push({
      key: d.clientDeliveryId,
      playerId: d.strikerId,
      x: d.shot.x,
      y: d.shot.y,
      runs: d.runsBatter,
    });
  }
  return out;
}
