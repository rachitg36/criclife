import { Aurora } from '@/components/ui/Aurora';
import { CountUp } from '@/components/ui/CountUp';
import { stat } from '@/lib/format';
import { oversDisplay } from '@/engine';
import { cn } from '@/lib/cn';
import type { AudienceView } from '../useAudienceView';

/**
 * docs/06 § 1 — the hero. Everything a spectator opened the link for has to be
 * in this first screenful: who is batting, the score, the target, and what the
 * chase needs.
 *
 * The aurora is tinted by `--accent`, which the store has already pointed at
 * the batting team's colour (docs/08 § 2 "Team tinting"), so nothing here
 * hardcodes a colour — CLAUDE.md rule 7.
 */
export function Hero({ view }: { view: AudienceView }) {
  const { innings, battingTeam, previousInnings, matchState } = view;
  const config = matchState?.config ?? null;

  if (!innings || !matchState || !config) {
    return (
      <section className="relative overflow-hidden px-4 py-10 text-center">
        <Aurora />
        <p className="relative text-[var(--text-secondary)]">
          {view.ready ? 'This match has not started yet.' : 'Loading…'}
        </p>
      </section>
    );
  }

  const result = matchState.result;
  // `result` alone is not "the match is over". A match completed or abandoned
  // while the chase was still short has no engine result — the delivery log
  // never implied one — and the hero went on offering "Need 1 off 4 balls"
  // under a FINAL OVER badge on a finished game. `view.isComplete` is the
  // server's word for it and has been available all along.
  const ended = result !== null || view.isComplete;
  // Both come off the view so `TvLayout` and this one cannot drift.
  const abandoned = view.isAbandoned;
  const resultLine = view.resultLine;
  const chasing = innings.target !== null;

  return (
    <section
      className={cn(
        'relative overflow-hidden px-4 pb-5 pt-6',
        // docs/06 § 4 — the final over gets its own high-contrast state.
        view.isLastOver && !ended && 'final-over'
      )}
    >
      <Aurora />

      <div className="relative flex flex-col items-center">
        {ended ? (
          <>
            <p
              className={
                abandoned
                  ? 'label-overline text-[var(--warning)]'
                  : 'label-overline text-[var(--accent)]'
              }
            >
              {abandoned ? 'Abandoned' : 'Result'}
            </p>
            <p className="mt-1 text-center text-[var(--text-display-md)] font-semibold leading-tight">
              {resultLine}
            </p>
            {abandoned && (
              <p className="mt-1 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
                No result — the match did not finish.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-heading-md)] font-semibold tracking-[0.04em] text-[var(--accent)]">
                {battingTeam?.name ?? '—'}
              </span>
              {view.isLastOver && (
                <span className="rounded-[var(--r-full)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] text-[var(--accent-fg)]">
                  FINAL OVER
                </span>
              )}
              {view.isHatTrickBall && (
                <span className="hat-trick-ribbon rounded-[var(--r-full)] px-2 py-0.5 text-[10px] font-bold tracking-[0.1em]">
                  HAT-TRICK BALL
                </span>
              )}
            </div>

            <div
              className="flex items-baseline gap-1 font-semibold leading-none"
              style={{ fontSize: 'var(--text-display-xl)' }}
            >
              <CountUp value={innings.runs} />
              <span className="text-[var(--text-tertiary)]">–</span>
              <CountUp value={innings.wickets} />
            </div>

            <p className="mt-1 text-[var(--text-body)] tabular-nums text-[var(--text-secondary)]">
              {oversDisplay(innings.legalBalls, config.ballsPerOver)} / {view.maxOvers} overs
            </p>
          </>
        )}

        {previousInnings && (
          <p className="mt-3 text-[var(--text-body-sm)] tabular-nums text-[var(--text-tertiary)]">
            {view.teamById.get(previousInnings.battingTeamId)?.name ?? '—'} {previousInnings.runs}-
            {previousInnings.wickets} (
            {oversDisplay(previousInnings.legalBalls, config.ballsPerOver)})
          </p>
        )}

        {!ended && chasing && view.need !== null && view.need > 0 && (
          <>
            <div className="mt-3 h-px w-32 bg-[var(--border-default)]" />
            <p className="mt-3 text-[var(--text-heading-md)] font-medium tabular-nums">
              Need {view.need} off {view.ballsLeft} ball{view.ballsLeft === 1 ? '' : 's'}
            </p>
          </>
        )}

        {!ended && (
          <p className="mt-2 text-[var(--text-body-sm)] tabular-nums text-[var(--text-tertiary)]">
            CRR {stat(view.crr)}
            {chasing && view.rrr !== null && Number.isFinite(view.rrr)
              ? ` · RRR ${stat(view.rrr)}`
              : ''}
          </p>
        )}
      </div>
    </section>
  );
}
