import { ChartFrame, SeriesLegend } from './ChartFrame';
import { makeScales, niceTicks } from './scales';
import type { RunRateSeries } from '@/features/audience/chartData';

/**
 * docs/06 § 2 — CRR against RRR over time.
 *
 * The required rate only exists once there is a target, so the first innings
 * draws one line, not two with a fabricated second. `null` points break the
 * RRR line rather than being interpolated across — a gap is honest, a straight
 * line through a gap is not.
 */
export function RunRateChart({ series, label }: { series: RunRateSeries; label: string }) {
  const values = series.points.flatMap((p) => [p.crr, ...(p.rrr === null ? [] : [p.rrr])]);
  const maxRate = Math.max(1, ...values.filter((v) => Number.isFinite(v)));
  const overs = Math.max(1, ...series.points.map((p) => p.overNumber));
  const { sx, sy } = makeScales(overs, Math.ceil(maxRate));
  const hasRrr = series.points.some((p) => p.rrr !== null);

  const segments: string[][] = [];
  let run: string[] = [];
  for (const p of series.points) {
    if (p.rrr === null || !Number.isFinite(p.rrr)) {
      if (run.length > 1) segments.push(run);
      run = [];
      continue;
    }
    run.push(`${sx(p.overNumber)},${sy(p.rrr)}`);
  }
  if (run.length > 1) segments.push(run);

  return (
    <ChartFrame
      title={`Run rate — ${label}`}
      description="Scoring rate against what the chase needs."
      yTicks={niceTicks(Math.ceil(maxRate))}
      xTicks={niceTicks(overs)}
      sx={sx}
      sy={sy}
      {...(series.points.length === 0 ? { empty: 'No completed overs yet.' } : {})}
      legend={
        <SeriesLegend
          items={[
            { label: 'CRR', colour: 'var(--accent)' },
            ...(hasRrr ? [{ label: 'RRR', colour: 'var(--extra)' }] : []),
          ]}
        />
      }
    >
      <polyline
        points={series.points.map((p) => `${sx(p.overNumber)},${sy(p.crr)}`).join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.join(' ')}
          fill="none"
          stroke="var(--extra)"
          strokeWidth={1.4}
          strokeDasharray="3 2"
          strokeLinejoin="round"
        />
      ))}
    </ChartFrame>
  );
}
