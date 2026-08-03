import { CountUp } from '@/components/ui/CountUp';
import { oversDisplay, currentRunRate, requiredRuns, ballsRemaining, requiredRunRate } from '@/engine';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 1 — the 92px score block, the hero of the screen. */
export function ScoreBlock() {
  const matchState = useScorerStore((s) => s.matchState);
  const config = useScorerStore((s) => s.config);
  if (!matchState || !config) return null;

  const innings = matchState.innings[matchState.currentInningsIndex];
  if (!innings) return null;

  const crr = currentRunRate(innings, config);
  const need = requiredRuns(innings);
  const ballsLeft = ballsRemaining(innings, config);
  const rrr = requiredRunRate(innings, config);

  return (
    <div className="flex shrink-0 flex-col justify-center px-3 py-1.5">
      <div className="flex items-baseline gap-2">
        <span
          className="font-display leading-none font-extrabold tabular-nums"
          style={{ fontSize: 'clamp(40px, 12vw, 68px)' }}
        >
          <CountUp value={innings.runs} />
          <span className="text-[var(--text-tertiary)]">-</span>
          <CountUp value={innings.wickets} />
        </span>
      </div>
      <div className="flex items-center justify-between text-[13px] text-[var(--text-secondary)] tabular-nums">
        <span>
          {oversDisplay(innings.legalBalls, config.ballsPerOver)} / {config.oversPerInnings} ov
        </span>
        <span>CRR {crr.toFixed(2)}</span>
      </div>
      {need !== null && (
        <div className="text-[13px] text-[var(--text-secondary)] tabular-nums">
          Need {need} off {ballsLeft} {rrr !== null && <>· RRR {rrr.toFixed(2)}</>}
        </div>
      )}
    </div>
  );
}
