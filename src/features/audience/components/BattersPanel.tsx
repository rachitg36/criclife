import { formatBowlingFigures, stat } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AudienceView } from '../useAudienceView';

/** docs/06 § 1 — the two batters at the crease and the bowler in his spell. */
export function BattersPanel({ view }: { view: AudienceView }) {
  const { innings, nameOf, matchState } = view;
  const config = matchState?.config;
  if (!innings || !config) return null;

  const strikerId = innings.strikerId;
  const nonStrikerId = innings.nonStrikerId;
  const bowlerId = innings.bowlerId;
  const bowler = bowlerId ? innings.bowlers[bowlerId] : null;

  const rows = [strikerId, nonStrikerId]
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, batter: innings.batters[id], onStrike: id === strikerId }));

  if (rows.length === 0 && !bowler) return null;

  return (
    <div className="border-b border-[var(--border-subtle)] px-4 py-3">
      <div className="flex flex-col gap-1.5">
        {rows.map(({ id, batter, onStrike }) => (
          <div key={id} className="flex items-baseline gap-2 text-[var(--text-body-sm)]">
            <span
              aria-hidden
              className={cn(
                'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                onStrike ? 'bg-[var(--accent)]' : 'bg-transparent'
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {nameOf(id)}
              {onStrike && <span className="sr-only"> (on strike)</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{batter?.runs ?? 0}</span>
              <span className="text-[var(--text-tertiary)]"> ({batter?.balls ?? 0})</span>
            </span>
            <span className="hidden shrink-0 text-[11px] tabular-nums text-[var(--text-tertiary)] sm:inline">
              {batter?.fours ?? 0}×4 {batter?.sixes ?? 0}×6
            </span>
            <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-tertiary)]">
              SR {stat(batter && batter.balls > 0 ? (batter.runs / batter.balls) * 100 : null, 0)}
            </span>
          </div>
        ))}
      </div>

      {bowler && bowlerId && (
        <>
          <div className="my-2 h-px bg-[var(--border-subtle)]" />
          <div className="flex items-baseline gap-2 text-[var(--text-body-sm)]">
            <span className="min-w-0 flex-1 truncate font-medium">{nameOf(bowlerId)}</span>
            <span className="shrink-0 tabular-nums">
              {formatBowlingFigures(
                bowler.legalBalls,
                bowler.maidens,
                bowler.runsConceded,
                bowler.wickets,
                config.ballsPerOver
              )}
            </span>
            <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-tertiary)]">
              ECON{' '}
              {stat(
                bowler.legalBalls > 0
                  ? bowler.runsConceded / (bowler.legalBalls / config.ballsPerOver)
                  : null
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
