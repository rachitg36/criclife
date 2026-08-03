import { buildInningsScorecard } from '@/engine';
import { formatOvers, formatScore, stat } from '@/lib/format';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 7 — full batting/bowling cards. Scrolling is
    fine here (unlike the pad itself). */
export function ScorecardTab() {
  const matchState = useScorerStore((s) => s.matchState);
  const config = useScorerStore((s) => s.config);
  const squadA = useScorerStore((s) => s.squadA);
  const squadB = useScorerStore((s) => s.squadB);
  if (!matchState || !config) return null;

  const nameFor = (id: string) => {
    const squad = [...squadA, ...squadB];
    return squad.find((p) => p.id === id)?.short_name ?? squad.find((p) => p.id === id)?.full_name ?? '—';
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {matchState.innings.length === 0 && (
        <p className="py-6 text-center text-[13px] text-[var(--text-tertiary)]">
          The match hasn't started yet.
        </p>
      )}
      {matchState.innings.map((innings) => {
        const card = buildInningsScorecard(innings, config);
        return (
          <div key={innings.inningsNo} className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-bold text-[var(--text-primary)]">
                {innings.isSuperOver ? 'Super Over' : `Innings ${innings.inningsNo}`}
              </span>
              <span className="text-[13px] tabular-nums text-[var(--text-secondary)]">
                {formatScore(card.runs, card.wickets)} ({card.oversDisplay})
              </span>
            </div>

            <table className="w-full text-[12px] tabular-nums">
              <thead>
                <tr className="text-left text-[var(--text-tertiary)]">
                  <th className="pb-1 font-normal">Batter</th>
                  <th className="pb-1 text-right font-normal">R</th>
                  <th className="pb-1 text-right font-normal">B</th>
                  <th className="pb-1 text-right font-normal">4s</th>
                  <th className="pb-1 text-right font-normal">6s</th>
                  <th className="pb-1 text-right font-normal">SR</th>
                </tr>
              </thead>
              <tbody>
                {card.batting.map((row) => (
                  <tr key={row.playerId} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1">
                      <div className="font-medium">{nameFor(row.playerId)}</div>
                      {row.dismissalText && (
                        <div className="text-[11px] text-[var(--text-tertiary)]">
                          {row.dismissalText}
                        </div>
                      )}
                      {!row.dismissalText && row.status === 'not_out' && row.balls > 0 && (
                        <div className="text-[11px] text-[var(--success)]">not out</div>
                      )}
                    </td>
                    <td className="py-1 text-right font-semibold">{row.runs}</td>
                    <td className="py-1 text-right">{row.balls}</td>
                    <td className="py-1 text-right">{row.fours}</td>
                    <td className="py-1 text-right">{row.sixes}</td>
                    <td className="py-1 text-right">{stat(row.strikeRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="mt-3 w-full text-[12px] tabular-nums">
              <thead>
                <tr className="text-left text-[var(--text-tertiary)]">
                  <th className="pb-1 font-normal">Bowler</th>
                  <th className="pb-1 text-right font-normal">O</th>
                  <th className="pb-1 text-right font-normal">M</th>
                  <th className="pb-1 text-right font-normal">R</th>
                  <th className="pb-1 text-right font-normal">W</th>
                  <th className="pb-1 text-right font-normal">Econ</th>
                </tr>
              </thead>
              <tbody>
                {card.bowling.map((row) => (
                  <tr key={row.playerId} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1 font-medium">{nameFor(row.playerId)}</td>
                    <td className="py-1 text-right">{formatOvers(row.legalBalls, config.ballsPerOver)}</td>
                    <td className="py-1 text-right">{row.maidens}</td>
                    <td className="py-1 text-right">{row.runsConceded}</td>
                    <td className="py-1 text-right font-semibold">{row.wickets}</td>
                    <td className="py-1 text-right">{stat(row.economy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
