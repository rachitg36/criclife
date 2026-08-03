import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { buildInningsScorecard, oversDisplay } from '@/engine';
import type { InningsState } from '@/engine/types';
import { formatOvers, stat } from '@/lib/format';
import { cn } from '@/lib/cn';
import { resolveNames } from '../feed';
import type { AudienceView } from '../useAudienceView';

/**
 * docs/06 § 2 "Scorecard" — both innings, collapsible, live-updating. Every
 * number here is projected from the delivery log through the engine's
 * `buildInningsScorecard`; nothing reads a denormalised stats table, so the
 * card can never disagree with the feed above it.
 */
export function ScorecardTab({ view }: { view: AudienceView }) {
  const { matchState, nameOf, teamById } = view;
  const config = matchState?.config;

  if (!matchState || !config || matchState.innings.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
        The scorecard appears once the first ball is bowled.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {matchState.innings.map((innings, index) => (
        <InningsCard
          key={innings.inningsNo}
          innings={innings}
          view={view}
          teamName={teamById.get(innings.battingTeamId)?.name ?? 'Batting side'}
          bowlingTeamName={teamById.get(innings.bowlingTeamId)?.name ?? 'Bowling side'}
          nameOf={nameOf}
          defaultOpen={index === matchState.currentInningsIndex}
        />
      ))}
    </div>
  );
}

function InningsCard({
  innings,
  view,
  teamName,
  bowlingTeamName,
  nameOf,
  defaultOpen,
}: {
  innings: InningsState;
  view: AudienceView;
  teamName: string;
  bowlingTeamName: string;
  nameOf: (id: string) => string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const config = view.matchState!.config;
  const card = buildInningsScorecard(innings, config);
  const extras =
    card.extras.wides +
    card.extras.noBalls +
    card.extras.byes +
    card.extras.legByes +
    card.extras.penalty;

  return (
    <section className="panel overflow-hidden rounded-[var(--r-lg)] p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[var(--text-heading-sm)] font-semibold">{teamName}</p>
          {innings.isSuperOver && <p className="label-overline">Super over</p>}
        </div>
        <p className="shrink-0 text-[var(--text-heading-md)] font-semibold tabular-nums">
          {card.runs}-{card.wickets}
          <span className="ml-1.5 text-[var(--text-body-sm)] font-normal text-[var(--text-tertiary)]">
            ({card.oversDisplay})
          </span>
        </p>
        <ChevronDown
          size={18}
          aria-hidden
          className={cn(
            'shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)]',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--border-subtle)]">
          <Table
            head={['Batter', 'R', 'B', '4s', '6s', 'SR']}
            caption={`${teamName} batting`}
            rows={card.batting.map((b) => ({
              key: b.playerId,
              primary: nameOf(b.playerId),
              secondary:
                b.status === 'did_not_bat'
                  ? 'did not bat'
                  : b.dismissalText
                    ? resolveNames(b.dismissalText, nameOf, extractIds(b.dismissalText))
                    : 'not out',
              cells: [
                b.status === 'did_not_bat' ? '–' : String(b.runs),
                b.status === 'did_not_bat' ? '–' : String(b.balls),
                String(b.fours),
                String(b.sixes),
                stat(b.strikeRate, 1),
              ],
              muted: b.status === 'did_not_bat',
            }))}
          />

          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-2.5 text-[var(--text-body-sm)]">
            <span className="text-[var(--text-secondary)]">
              Extras
              <span className="ml-2 text-[11px] tabular-nums text-[var(--text-tertiary)]">
                (b {card.extras.byes}, lb {card.extras.legByes}, w {card.extras.wides}, nb{' '}
                {card.extras.noBalls}
                {card.extras.penalty > 0 ? `, p ${card.extras.penalty}` : ''})
              </span>
            </span>
            <span className="font-semibold tabular-nums">{extras}</span>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-2.5">
            <span className="text-[var(--text-body-sm)] font-semibold">Total</span>
            <span className="font-semibold tabular-nums">
              {card.runs}-{card.wickets} ({card.oversDisplay} ov)
            </span>
          </div>

          {innings.fallOfWickets.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] px-4 py-2.5">
              <p className="label-overline mb-1">Fall of wickets</p>
              <p className="text-[12px] leading-relaxed tabular-nums text-[var(--text-secondary)]">
                {innings.fallOfWickets
                  .map(
                    (f) =>
                      `${f.wicketNumber}-${f.runs} (${nameOf(f.playerId)}, ${formatOvers(
                        f.legalBalls,
                        config.ballsPerOver
                      )})`
                  )
                  .join(' · ')}
              </p>
            </div>
          )}

          <Table
            head={['Bowler', 'O', 'M', 'R', 'W', 'Econ']}
            caption={`${bowlingTeamName} bowling`}
            rows={card.bowling.map((b) => ({
              key: b.playerId,
              primary: nameOf(b.playerId),
              secondary:
                b.wides > 0 || b.noBalls > 0
                  ? `${b.wides} wd · ${b.noBalls} nb`
                  : `${b.dots} dot${b.dots === 1 ? '' : 's'}`,
              cells: [
                oversDisplay(b.legalBalls, config.ballsPerOver),
                String(b.maidens),
                String(b.runsConceded),
                String(b.wickets),
                stat(b.economy),
              ],
              muted: false,
            }))}
          />
        </div>
      )}
    </section>
  );
}

/** Player ids inside an engine-generated dismissal string, for name substitution. */
function extractIds(text: string): string[] {
  return text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
}

type Row = {
  key: string;
  primary: string;
  secondary: string;
  cells: string[];
  muted: boolean;
};

function Table({ head, rows, caption }: { head: string[]; rows: Row[]; caption: string }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full border-t border-[var(--border-subtle)] text-[var(--text-body-sm)]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-[var(--text-tertiary)]">
          <th scope="col" className="px-4 py-1.5 text-left text-[11px] font-medium">
            {head[0]}
          </th>
          {head.slice(1).map((h) => (
            <th key={h} scope="col" className="px-1 py-1.5 text-right text-[11px] font-medium">
              {h}
            </th>
          ))}
          <th className="w-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={cn('align-top', row.muted && 'opacity-55')}>
            <th scope="row" className="max-w-0 px-4 py-1.5 text-left font-normal">
              <span className="block truncate font-medium">{row.primary}</span>
              <span className="block truncate text-[11px] text-[var(--text-tertiary)]">
                {row.secondary}
              </span>
            </th>
            {row.cells.map((c, i) => (
              <td
                key={i}
                className={cn('px-1 py-1.5 text-right tabular-nums', i === 0 && 'font-semibold')}
              >
                {c}
              </td>
            ))}
            <td className="w-2" />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
