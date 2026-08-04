import { useEffect, useMemo, useState } from 'react';
import { Aurora } from '@/components/ui/Aurora';
import { CountUp } from '@/components/ui/CountUp';
import { LivePill } from '@/components/ui/LivePill';
import { oversDisplay } from '@/engine';
import { formatBowlingFigures, stat } from '@/lib/format';
import { cn } from '@/lib/cn';
import { buildFeed } from '../feed';
import { useAudienceStore } from '../store';
import type { AudienceView } from '../useAudienceView';
import { ThisOverStrip } from './ThisOverStrip';
import { ScorecardTab } from './ScorecardTab';

/**
 * docs/06 § 6 — Big Screen mode (`?tv=1`): a laptop plugged into a TV at the
 * ground. No chrome, no navigation, nothing tappable, everything sized to be
 * read from across a field.
 *
 * It renders from the same `useAudienceView` as the phone layout — the two
 * must never drift into having different ideas of the score.
 */
const CYCLE_MS = 12_000;

export function TvLayout({ view }: { view: AudienceView }) {
  const connection = useAudienceStore((s) => s.connection);
  const deliveries = useAudienceStore((s) => s.deliveries);
  const inningsRows = useAudienceStore((s) => s.innings);
  const match = useAudienceStore((s) => s.match);
  const [panel, setPanel] = useState<'scorecard' | 'batters'>('batters');

  // docs/06 § 6 — "auto-cycling between scorecard and charts". Charts are a
  // lazy chunk and a kiosk has no one to wait for a spinner, so the cycle is
  // between the two panels that are already loaded; see HANDOFF.md § 6.2.
  useEffect(() => {
    const timer = setInterval(
      () => setPanel((p) => (p === 'batters' ? 'scorecard' : 'batters')),
      CYCLE_MS
    );
    return () => clearInterval(timer);
  }, []);

  const feed = useMemo(() => {
    if (!match) return [];
    const battingTeamByInnings = new Map(
      inningsRows.map((i) => [i.inningsNo, i.battingTeamId] as const)
    );
    return buildFeed({
      deliveries,
      config: match.config,
      nameOf: view.nameOf,
      teamCodeOf: (id) => view.teamById.get(id)?.shortCode ?? '—',
      battingTeamOf: (no) => battingTeamByInnings.get(no) ?? null,
    }).slice(0, 12);
  }, [deliveries, inningsRows, match, view.nameOf, view.teamById]);

  const { innings, matchState } = view;
  const config = matchState?.config;
  const bowlerId = innings?.bowlerId ?? null;
  const bowler = bowlerId && innings ? innings.bowlers[bowlerId] : null;

  return (
    <div className="relative grid h-[100dvh] grid-cols-[1.6fr_1fr] overflow-hidden bg-[var(--bg-base)]">
      <Aurora />

      <div className="relative flex flex-col justify-between p-[3vh]">
        <div className="flex items-center gap-4">
          <h1 className="text-[2.2vh] font-semibold tracking-[0.06em] text-[var(--text-secondary)]">
            {view.battingTeam?.name ?? match?.title ?? 'CricLife'}
          </h1>
          {match?.venue && (
            <span className="text-[1.8vh] text-[var(--text-tertiary)]">· {match.venue}</span>
          )}
          <span className="ml-auto scale-150 origin-right">
            <LivePill state={connection} />
          </span>
        </div>

        {/* `view.isComplete`, not `matchState.result`. An abandoned match has
            no engine result at all, so the big screen went on showing a live
            score for a game that had been called off. */}
        {view.isComplete ? (
          <p
            className={
              view.isAbandoned
                ? 'text-[7vh] leading-tight font-semibold text-[var(--warning)]'
                : 'text-[7vh] leading-tight font-semibold text-[var(--accent)]'
            }
          >
            {view.isAbandoned ? `Abandoned — ${view.resultLine}` : view.resultLine}
          </p>
        ) : innings && config ? (
          <div>
            <div className="flex items-baseline gap-3 text-[18vh] font-semibold leading-none">
              <CountUp value={innings.runs} />
              <span className="text-[var(--text-tertiary)]">–</span>
              <CountUp value={innings.wickets} />
            </div>
            <p className="mt-[1vh] text-[4vh] tabular-nums text-[var(--text-secondary)]">
              {oversDisplay(innings.legalBalls, config.ballsPerOver)} / {view.maxOvers} overs
              {view.crr !== null && (
                <span className="ml-[2vh] text-[var(--text-tertiary)]">CRR {stat(view.crr)}</span>
              )}
            </p>
            {view.need !== null && view.need > 0 && (
              <p className="mt-[1.5vh] text-[4.5vh] font-medium tabular-nums text-[var(--accent)]">
                Need {view.need} off {view.ballsLeft}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[5vh] text-[var(--text-secondary)]">Waiting for the first ball…</p>
        )}

        <div className="scale-[1.4] origin-left">
          <ThisOverStrip balls={view.thisOver} />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-glass)]">
        {panel === 'batters' ? (
          <div className="flex flex-col gap-[2vh] p-[3vh]">
            <p className="text-[1.8vh] font-semibold tracking-[0.1em] text-[var(--text-tertiary)]">
              AT THE CREASE
            </p>
            {innings &&
              [innings.strikerId, innings.nonStrikerId]
                .filter((id): id is string => Boolean(id))
                .map((id) => {
                  const b = innings.batters[id];
                  return (
                    <div key={id} className="flex items-baseline gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          'h-[1.2vh] w-[1.2vh] shrink-0 rounded-full',
                          id === innings.strikerId ? 'bg-[var(--accent)]' : 'bg-transparent'
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[3vh]">{view.nameOf(id)}</span>
                      <span className="text-[3vh] font-semibold tabular-nums">
                        {b?.runs ?? 0}
                        <span className="text-[2vh] text-[var(--text-tertiary)]">
                          {' '}
                          ({b?.balls ?? 0})
                        </span>
                      </span>
                    </div>
                  );
                })}

            {bowler && bowlerId && config && (
              <>
                <div className="h-px bg-[var(--border-subtle)]" />
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate text-[3vh]">
                    {view.nameOf(bowlerId)}
                  </span>
                  <span className="text-[2.6vh] tabular-nums text-[var(--text-secondary)]">
                    {formatBowlingFigures(
                      bowler.legalBalls,
                      bowler.maidens,
                      bowler.runsConceded,
                      bowler.wickets,
                      config.ballsPerOver
                    )}
                  </span>
                </div>
              </>
            )}

            <div className="mt-[1vh] h-px bg-[var(--border-subtle)]" />
            <p className="text-[1.8vh] font-semibold tracking-[0.1em] text-[var(--text-tertiary)]">
              LAST BALLS
            </p>
            <ul className="flex min-h-0 flex-1 flex-col gap-[1vh] overflow-hidden">
              {feed
                .filter((f) => f.kind === 'ball')
                .slice(0, 7)
                .map((f) => (
                  <li key={f.key} className="flex gap-2 text-[2.1vh] leading-snug">
                    <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">
                      {f.kind === 'ball' ? f.label : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {f.kind === 'ball' ? f.text : ''}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden text-[1.6vh]">
            <ScorecardTab view={view} />
          </div>
        )}
      </div>
    </div>
  );
}
