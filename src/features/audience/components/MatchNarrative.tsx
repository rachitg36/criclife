import { buildNarrative } from '../narrative';
import type { AudienceView } from '../useAudienceView';

/**
 * How the match went, in sentences.
 *
 * Shown only once the match is over. Mid-innings this would be a running
 * commentary competing with the feed, which already exists and is better at
 * it; the value here is for someone opening a finished match cold, days
 * later, who wants the shape of it without reading a scorecard.
 *
 * `buildNarrative` is pure and returns nothing when it has nothing worth
 * saying, so this renders nothing rather than an empty panel.
 */
export function MatchNarrative({ view }: { view: AudienceView }) {
  const state = view.matchState;
  if (!state) return null;

  const lines = buildNarrative({
    innings: state.innings,
    config: state.config,
    result: state.result,
    nameOfTeam: (id) => view.teamById.get(id)?.name ?? 'They',
    nameOfPlayer: view.nameOf,
  });
  if (lines.length === 0) return null;

  return (
    <section className="mx-3 my-3 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
      <h2 className="label-overline mb-2">How it went</h2>
      <div className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <p key={line} className="text-[var(--text-body)] text-[var(--text-secondary)]">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}
