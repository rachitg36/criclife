import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { PlayerId } from '@/engine/types';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 2/5 — AWAITING_OPENERS: a two-slot picker at
    innings start. Tap the striker, then the non-striker; one tap each. */
export function OpenersPicker() {
  const matchState = useScorerStore((s) => s.matchState);
  const teamAId = useScorerStore((s) => s.teamAId);
  const squadA = useScorerStore((s) => s.squadA);
  const squadB = useScorerStore((s) => s.squadB);
  const pickOpeners = useScorerStore((s) => s.pickOpeners);
  const [striker, setStriker] = useState<PlayerId | null>(null);

  const innings = matchState?.innings[matchState.currentInningsIndex];
  if (!innings) return null;

  const battingSquad = innings.battingTeamId === teamAId ? squadA : squadB;

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
      <span className="text-[13px] font-semibold text-[var(--text-secondary)]">
        {striker ? 'Who is the non-striker?' : 'Who is on strike?'}
      </span>
      <div className="grid grid-cols-2 gap-2">
        {battingSquad
          .filter((p) => p.id !== striker)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              className="press panel min-h-14 rounded-[var(--r-md)] px-2 text-[14px] font-semibold"
              onClick={() => {
                if (!striker) setStriker(p.id);
                else pickOpeners(striker, p.id);
              }}
            >
              {p.short_name ?? p.full_name}
            </button>
          ))}
      </div>
      {striker && (
        <button
          type="button"
          className={cn('press mt-1 self-start text-[13px] text-[var(--text-secondary)]')}
          onClick={() => setStriker(null)}
        >
          Back
        </button>
      )}
    </div>
  );
}
