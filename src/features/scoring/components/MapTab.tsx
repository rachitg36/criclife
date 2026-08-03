import { ScoringRightsMapPage } from '@/features/matches/ScoringRightsMapPage';

/** docs/05-SCORER-VIEW.md § 7 — the Scoring Rights Map (docs/03 § 3.4),
    reused as-is rather than rebuilt: `useParams` still resolves `:matchId`
    from this route since the scorer view lives at `/matches/:matchId/score`. */
export function MapTab() {
  return (
    <div className="flex-1 overflow-y-auto">
      <ScoringRightsMapPage />
    </div>
  );
}
