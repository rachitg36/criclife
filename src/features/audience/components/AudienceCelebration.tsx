import { buildHonours, playerOfTheMatch, winningSidePlayers } from '@/engine';
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
  // **The server's winner first.** `matchState.result` only exists if this
  // client's replay happened to produce one, and it does not for a match that
  // was completed server-side or replayed from a partial log — so the
  // celebration silently never appeared. `matches.winner_team_id` is written
  // by `complete_match` and is the durable answer.
  const winnerId = view.winnerTeamId ?? state?.result?.winnerTeamId ?? null;
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

  // The **stored** pick wins. `complete_match` decided it once, at the moment
  // the match ended; recomputing here would mean a later change to the weights
  // silently rewrote who won a match played months ago. Falling back to the
  // computation only covers matches finished before it was ever stored.
  const storedPom = view.playerOfMatchId;
  const computed = storedPom ? null : playerOfTheMatch(state.innings, winnerId);
  const pomId = storedPom ?? computed?.playerId ?? null;
  const pomSummary = storedPom
    ? [honours.topScore, honours.bestBowling]
        .filter((h) => h?.playerId === storedPom)
        .map((h) => h!.figures)
        .join(' · ')
    : (computed?.summary ?? '');

  return (
    <div className="mx-3 my-3 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)]">
      <WinCelebration
        teamName={team?.name ?? 'The winners'}
        teamColor={team?.primaryColor ?? 'var(--accent)'}
        headline={view.resultLine}
        players={players}
        {...(pomId ? { playerOfTheMatch: { name: view.nameOf(pomId), summary: pomSummary } } : {})}
      />
    </div>
  );
}
