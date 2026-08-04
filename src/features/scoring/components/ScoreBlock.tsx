import { CountUp } from '@/components/ui/CountUp';
import {
  oversDisplay,
  currentRunRate,
  requiredRuns,
  ballsRemaining,
  configForInnings,
  requiredRunRate,
} from '@/engine';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 1 — the 92px score block, the hero of the screen. */
export function ScoreBlock() {
  const matchState = useScorerStore((s) => s.matchState);
  const matchConfig = useScorerStore((s) => s.config);
  const teamAId = useScorerStore((s) => s.teamAId);
  const teamAName = useScorerStore((s) => s.teamAName);
  const teamBName = useScorerStore((s) => s.teamBName);
  if (!matchState || !matchConfig) return null;

  const innings = matchState.innings[matchState.currentInningsIndex];
  if (!innings) return null;

  // A super over is one over, not the match's two — reading the match config
  // flat put "need 2 off 12 balls" on the pad during a six-ball super over.
  const config = configForInnings(matchConfig, innings);

  const nameOfTeam = (id: string) => (id === teamAId ? teamAName : teamBName);
  const battingName = nameOfTeam(innings.battingTeamId);
  const bowlingName = nameOfTeam(innings.bowlingTeamId);

  const crr = currentRunRate(innings, config);
  const need = requiredRuns(innings);
  const ballsLeft = ballsRemaining(innings, config);
  const rrr = requiredRunRate(innings, config);

  return (
    <div className="flex shrink-0 flex-col justify-center px-3 py-1.5">
      {/* Who is batting, in words. The pad showed a score and two batter names
          and never once named the side — "it is not clear which team is batting
          and which team is bowling". A scorer looking after two sides they do
          not play for cannot infer it from the names. */}
      <div className="flex items-baseline gap-1.5 text-[11px] tracking-[0.04em] uppercase">
        <span className="font-bold text-[var(--accent)]">{battingName ?? 'Batting'}</span>
        <span className="text-[var(--text-tertiary)]">batting · v</span>
        <span className="truncate font-semibold text-[var(--text-secondary)]">
          {bowlingName ?? 'Bowling'}
        </span>
        {innings.isSuperOver && (
          <span className="ml-auto shrink-0 rounded-[var(--r-full)] bg-[var(--warning)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-inverse)]">
            SUPER OVER
          </span>
        )}
      </div>
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
