import { ChartFrame, SeriesLegend } from './ChartFrame';
import { makeScales, niceTicks, SERIES_COLOURS } from './scales';
import type { WormSeries } from '@/features/audience/chartData';

/** docs/06 § 2 — cumulative runs vs overs, both innings overlaid, wickets as dots. */
export function WormChart({
  series,
  labelOf,
}: {
  series: WormSeries[];
  labelOf: (teamId: string) => string;
}) {
  const maxOvers = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.overs)));
  const maxRuns = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.runs)));
  const { sx, sy } = makeScales(maxOvers, maxRuns);
  const hasData = series.some((s) => s.points.length > 1);

  return (
    <ChartFrame
      title="Worm"
      description="Runs scored as the innings goes on. Dots are wickets."
      yTicks={niceTicks(maxRuns)}
      xTicks={niceTicks(maxOvers)}
      sx={sx}
      sy={sy}
      {...(hasData ? {} : { empty: 'No balls bowled yet.' })}
      legend={
        <SeriesLegend
          items={series.map((s, i) => ({
            label: labelOf(s.battingTeamId),
            colour: SERIES_COLOURS[i % SERIES_COLOURS.length]!,
          }))}
        />
      }
    >
      {series.map((s, i) => {
        const colour = SERIES_COLOURS[i % SERIES_COLOURS.length]!;
        return (
          <g key={s.inningsNo}>
            <polyline
              points={s.points.map((p) => `${sx(p.overs)},${sy(p.runs)}`).join(' ')}
              fill="none"
              stroke={colour}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.wickets.map((w) => (
              <circle
                key={`${w.overs}-${w.playerId}`}
                cx={sx(w.overs)}
                cy={sy(w.runs)}
                r={2.4}
                fill="var(--wicket)"
                stroke="var(--bg-base)"
                strokeWidth={0.8}
              />
            ))}
          </g>
        );
      })}
    </ChartFrame>
  );
}
