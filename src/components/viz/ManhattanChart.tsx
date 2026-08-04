import { ChartFrame } from './ChartFrame';
import { makeScales, niceTicks, overTicks, plotArea } from './scales';
import type { ManhattanSeries } from '@/features/audience/chartData';

/** docs/06 § 2 — runs per over as bars, wickets as red markers. */
export function ManhattanChart({ series, label }: { series: ManhattanSeries; label: string }) {
  const maxRuns = Math.max(1, ...series.bars.map((b) => b.runs));
  const overs = series.bars.length;
  const { sx, sy } = makeScales(Math.max(1, overs), maxRuns);
  const barWidth = Math.max(2, (plotArea.width / Math.max(1, overs)) * 0.7);

  return (
    <ChartFrame
      title={`Manhattan — ${label}`}
      description="Runs conceded in each over. Markers show wickets."
      yTicks={niceTicks(maxRuns)}
      xTicks={overTicks(overs)}
      sx={sx}
      sy={sy}
      {...(overs === 0 ? { empty: 'No overs bowled yet.' } : {})}
    >
      {series.bars.map((bar) => {
        const cx = sx(bar.overNumber - 0.5);
        const top = sy(bar.runs);
        return (
          <g key={bar.overNumber}>
            <rect
              x={cx - barWidth / 2}
              y={top}
              width={barWidth}
              height={Math.max(0.5, plotArea.y0 - top)}
              rx={1}
              fill="var(--accent)"
              opacity={0.85}
            />
            {Array.from({ length: bar.wickets }, (_, i) => (
              <circle key={i} cx={cx} cy={top - 4 - i * 4} r={1.8} fill="var(--wicket)" />
            ))}
          </g>
        );
      })}
    </ChartFrame>
  );
}
