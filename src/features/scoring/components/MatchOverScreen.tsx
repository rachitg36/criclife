import { useNavigate, useParams } from 'react-router';
import { buildHonours, playerOfTheMatch, winningSidePlayers } from '@/engine';
import { WinCelebration, type Celebrant } from '@/components/ui/WinCelebration';
import { shortName } from '@/lib/format';
import { useScorerStore } from '../store';
import { resultText } from '../resultText';

/** docs/05-SCORER-VIEW.md § 5 — MATCH_OVER: result card + "Publish". There
    is no separate publish mechanism yet (a match's public slug already
    makes it shareable — the audience view that consumes it is Phase 7), so
    "Publish" is the exit CTA back to the match hub.

    The card itself was a grey "Match complete" pill and one sentence, which
    is a poor answer to several hours of somebody's Saturday. `WinCelebration`
    is shared with the audience view so the scorer and the spectators see the
    same moment; `compact` keeps it inside the no-scroll shell (rule 2). */
export function MatchOverScreen() {
  const matchResult = useScorerStore((s) => s.matchResult);
  const matchState = useScorerStore((s) => s.matchState);
  const teamAId = useScorerStore((s) => s.teamAId);
  const teamAName = useScorerStore((s) => s.teamAName);
  const teamBName = useScorerStore((s) => s.teamBName);
  const teamAColor = useScorerStore((s) => s.teamAColor);
  const teamBColor = useScorerStore((s) => s.teamBColor);
  const squadA = useScorerStore((s) => s.squadA);
  const squadB = useScorerStore((s) => s.squadB);
  const { matchId } = useParams();
  const navigate = useNavigate();

  const nameOfTeam = (id: string) =>
    id === teamAId ? (teamAName ?? 'Team A') : (teamBName ?? 'Team B');
  const text = resultText(matchResult, nameOfTeam);

  const winnerId = matchResult?.winnerTeamId ?? null;
  const squad = [...squadA, ...squadB];
  const playerName = (id: string) => {
    const p = squad.find((x) => x.id === id);
    return p ? shortName(p.full_name) : 'Player';
  };
  // The winners' own colour, the same one the audience view celebrates in.
  // The match query already selected the whole team row; the store simply
  // never kept it.
  const teamColor = (winnerId === teamAId ? teamAColor : teamBColor) ?? 'var(--accent)';

  const honours = matchState
    ? buildHonours(matchState.innings)
    : { topScore: null, bestBowling: null };
  const noteFor = (id: string) => {
    if (honours.topScore?.playerId === id) return honours.topScore.figures;
    if (honours.bestBowling?.playerId === id) return honours.bestBowling.figures;
    return undefined;
  };

  const players: Celebrant[] =
    matchState && winnerId
      ? winningSidePlayers(matchState.innings, winnerId).map((id) => ({
          id,
          name: playerName(id),
          note: noteFor(id),
        }))
      : [];

  // A tie or a no-result has no winners to celebrate, and confetti over
  // "Match tied" would be worse than the grey pill was.
  if (!winnerId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-4 text-center">
        <span className="rounded-full bg-[var(--surface-3)] px-3 py-1 text-[12px] font-bold text-[var(--text-secondary)] uppercase">
          Match complete
        </span>
        <p className="max-w-xs text-[17px] font-semibold text-[var(--text-primary)]">{text}</p>
        <PublishButton onClick={() => navigate(`/matches/${matchId}`)} />
      </div>
    );
  }

  const pom = matchState ? playerOfTheMatch(matchState.innings, winnerId) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WinCelebration
        compact
        teamName={nameOfTeam(winnerId)}
        teamColor={teamColor}
        headline={text}
        players={players}
        {...(pom
          ? { playerOfTheMatch: { name: playerName(pom.playerId), summary: pom.summary } }
          : {})}
      />
      <div className="shrink-0 px-5 pb-4">
        <PublishButton onClick={() => navigate(`/matches/${matchId}`)} />
      </div>
    </div>
  );
}

function PublishButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="press min-h-14 w-full rounded-[var(--r-md)] bg-[var(--accent)] text-[16px] font-bold text-[var(--accent-fg)]"
      onClick={onClick}
    >
      Publish
    </button>
  );
}
