import { stat } from '@/lib/format';
import { usePlayerCareer } from './hooks';

/**
 * Career batting, bowling and fielding for one player.
 *
 * Phase 8 built `player_career_stats` and `rebuild_career_stats` fills it in
 * every time a match finalises — and nothing in the app ever showed it. The
 * numbers have existed since the first completed match; this is the screen
 * that reads them.
 *
 * `stat()` renders null as an em dash, never `NaN` or `0.00` (CLAUDE.md's
 * conventions): a bowling average of nothing is not zero, and showing 0.00 to
 * someone who has never bowled is worse than showing nothing.
 */
export function CareerStats({ playerId }: { playerId: string }) {
  const { data, isLoading } = usePlayerCareer(playerId);

  if (isLoading) return null;
  if (!data || data.matches === 0) {
    return (
      <section className="panel p-4 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        No matches yet. Career figures appear once a match they played in is complete.
      </section>
    );
  }

  const best =
    data.best_bowling_wickets === null
      ? null
      : `${data.best_bowling_wickets}/${data.best_bowling_runs ?? 0}`;
  const hs =
    data.highest_score === null
      ? null
      : `${data.highest_score}${data.highest_score_not_out ? '*' : ''}`;

  return (
    <div className="space-y-3">
      <section className="panel p-4">
        <h2 className="label-overline mb-3">Batting</h2>
        <dl className="grid grid-cols-3 gap-y-3">
          <Cell label="Matches" value={String(data.matches)} />
          <Cell label="Innings" value={String(data.innings_batted)} />
          <Cell label="Runs" value={String(data.runs)} />
          <Cell label="Average" value={stat(data.batting_average)} />
          <Cell label="Strike rate" value={stat(data.strike_rate)} />
          <Cell label="Best" value={hs ?? '–'} />
          <Cell label="50s" value={String(data.fifties)} />
          <Cell label="100s" value={String(data.hundreds)} />
          <Cell label="Ducks" value={String(data.ducks)} />
        </dl>
      </section>

      <section className="panel p-4">
        <h2 className="label-overline mb-3">Bowling</h2>
        <dl className="grid grid-cols-3 gap-y-3">
          <Cell label="Innings" value={String(data.innings_bowled)} />
          <Cell label="Wickets" value={String(data.wickets)} />
          <Cell label="Best" value={best ?? '–'} />
          <Cell label="Average" value={stat(data.bowling_average)} />
          <Cell label="Economy" value={stat(data.economy)} />
          <Cell label="5w" value={String(data.five_wicket_hauls)} />
        </dl>
      </section>

      <section className="panel p-4">
        <h2 className="label-overline mb-3">Fielding</h2>
        <dl className="grid grid-cols-3 gap-y-3">
          <Cell label="Catches" value={String(data.catches)} />
          <Cell label="Stumpings" value={String(data.stumpings)} />
          <Cell label="Run outs" value={String(data.run_outs)} />
        </dl>
      </section>

      <section className="panel p-4">
        <h2 className="label-overline mb-3">Rating</h2>
        <dl className="grid grid-cols-3 gap-y-3">
          <Cell label="Overall" value={stat(data.overall_rating, 0)} />
          <Cell label="Batting" value={stat(data.batting_rating, 0)} />
          <Cell label="Bowling" value={stat(data.bowling_rating, 0)} />
        </dl>
        {/* docs/07's own mitigation for "the ranking formula feels unfair" is
            publishing how it works, which /settings/about already does. */}
        <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
          Ratings decay with time — recent form counts for more. How it is calculated is in Settings
          → About.
        </p>
      </section>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[0.04em] text-[var(--text-tertiary)] uppercase">
        {label}
      </dt>
      <dd className="text-[17px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
