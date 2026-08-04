import { useMemo, useState } from 'react';
import { ManhattanChart } from '@/components/viz/ManhattanChart';
import { PartnershipChart } from '@/components/viz/PartnershipChart';
import { RunRateChart } from '@/components/viz/RunRateChart';
import { WagonWheel } from '@/components/viz/WagonWheel';
import { WormChart } from '@/components/viz/WormChart';
import {
  buildManhattan,
  buildPartnershipBars,
  buildRunRate,
  buildWagonWheel,
  buildWorm,
} from '../chartData';
import { useAudienceStore } from '../store';
import type { AudienceView } from '../useAudienceView';

/**
 * docs/06 § 2 "Charts". This whole module is behind a `React.lazy` boundary in
 * `AudienceRoute` (docs/06 § 8 — "charts are lazy-loaded per tab, not in the
 * initial bundle"), which is what keeps `src/components/viz/*` out of the
 * audience route's initial JS budget entirely.
 */
export default function ChartsTab({ view }: { view: AudienceView }) {
  const deliveries = useAudienceStore((s) => s.deliveries);
  const scrubTo = useAudienceStore((s) => s.scrubTo);
  const inningsRows = useAudienceStore((s) => s.innings);
  const match = useAudienceStore((s) => s.match);
  const [wagonBatter, setWagonBatter] = useState<string | null>(null);

  const visible = useMemo(
    () => (scrubTo === null ? deliveries : deliveries.slice(0, scrubTo)),
    [deliveries, scrubTo]
  );

  const inningsNo = view.innings?.inningsNo ?? inningsRows[0]?.inningsNo ?? 1;

  const charts = useMemo(() => {
    if (!match) return null;
    const battingTeamOf = (no: number) =>
      inningsRows.find((i) => i.inningsNo === no)?.battingTeamId ?? '';
    const targetOf = (no: number) => {
      const row = inningsRows.find((i) => i.inningsNo === no);
      return row?.revisedTarget ?? row?.target ?? null;
    };
    const oversOf = (no: number) =>
      inningsRows.find((i) => i.inningsNo === no)?.revisedOvers ?? match.config.oversPerInnings;

    return {
      worm: buildWorm(visible, match.config, battingTeamOf),
      manhattan: buildManhattan(visible, battingTeamOf),
      runRate: buildRunRate(visible, match.config, battingTeamOf, targetOf, oversOf),
      partnerships: buildPartnershipBars(visible, inningsNo),
      shots: buildWagonWheel(visible, inningsNo, wagonBatter),
      batters: [
        ...new Set(
          visible.filter((d) => d.inningsNo === inningsNo && d.shot).map((d) => d.strikerId)
        ),
      ],
    };
  }, [visible, match, inningsRows, inningsNo, wagonBatter]);

  if (!charts || !match) return null;

  // Names in the chart legends and titles — there is room, and "Manhattan —
  // Köln" says more than "Manhattan — TM2". The per-ball feed keeps short
  // codes, where a row is a few characters wide.
  const teamLabel = (teamId: string) => view.teamById.get(teamId)?.name ?? '—';

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <WormChart series={charts.worm} labelOf={teamLabel} />

      {charts.manhattan.map((series) => (
        <ManhattanChart
          key={series.inningsNo}
          series={series}
          label={teamLabel(series.battingTeamId)}
        />
      ))}

      {charts.runRate.map((series) => (
        <RunRateChart
          key={series.inningsNo}
          series={series}
          label={teamLabel(series.battingTeamId)}
        />
      ))}

      <PartnershipChart bars={charts.partnerships} nameOf={view.nameOf} />

      <WagonWheel
        shots={charts.shots}
        nameOf={view.nameOf}
        batters={charts.batters}
        selected={wagonBatter}
        onSelect={setWagonBatter}
      />
    </div>
  );
}
