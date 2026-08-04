import { buildHonours, winningSidePlayers } from '@/engine';
import { WinCelebration, type Celebrant } from '@/components/ui/WinCelebration';
import type { AudienceView } from '../useAudienceView';

/**
 * The winners, on the spectators' screen.
 *
 * Shares `WinCelebration` with the scorer's own match-over screen so the two
 * cannot drift into celebrating differently — but this one has the thing the
 * scorer store does not: `teams.primary_color`. The whole point of the screen
 * is that it belongs to the winning side, so the colour is worth the plumbing.
 *
 * Renders nothing without a winner. A tie or an abandoned match has no side to
 * celebrate, and confetti over "no result" would be worse than the plain line
 * that replaced it.
 */
export function AudienceCelebration({ view }: { view: AudienceView }) {
  const state = view.matchState;
  const winnerId = state?.result?.winnerTeamId ?? null;
  if (!state || !winnerId || view.isAbandoned) return null;

  const team = view.teamById.get(winnerId);
  const honours = buildHonours(state.innings);
  const noteFor = (id: string) => {
    if (honours.topScore?.playerId === id) return honours.topScore.figures;
    if (honours.bestBowling?.playerId === id) return honours.bestBowling.figures;
    return undefined;
  };

  const players: Celebrant[] = winningSidePlayers(state.innings, winnerId).map((id) => ({
    id,
    name: view.nameOf(id),
    note: noteFor(id),
  }));

  return (
    <div className="mx-3 my-3 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)]">
      <WinCelebration
        teamName={team?.name ?? 'The winners'}
        teamColor={team?.primaryColor ?? 'var(--accent)'}
        headline={view.resultLine}
        players={players}
      />
    </div>
  );
}
