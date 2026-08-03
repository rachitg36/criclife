import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { PlayerId, WicketType } from '@/engine/types';
import { useScorerStore } from '../store';

type PrimaryTile = { type: WicketType; label: string; freeHitOk?: boolean };

const PRIMARY: PrimaryTile[] = [
  { type: 'bowled', label: 'BOWLED' },
  { type: 'caught', label: 'CAUGHT' },
  { type: 'lbw', label: 'LBW' },
  { type: 'run_out', label: 'RUN OUT', freeHitOk: true },
  { type: 'stumped', label: 'STUMPED' },
];

const MORE_TILES: PrimaryTile[] = [
  { type: 'hit_wicket', label: 'HIT WICKET' },
  { type: 'obstructing_the_field', label: 'OBSTRUCTING', freeHitOk: true },
  { type: 'handled_the_ball', label: 'HANDLED BALL' },
  { type: 'timed_out', label: 'TIMED OUT' },
  { type: 'hit_ball_twice', label: 'HIT BALL TWICE' },
  { type: 'retired_out', label: 'RETIRE OUT' },
];

type Step =
  | { name: 'root' }
  | { name: 'more' }
  | { name: 'caught-fielder' }
  | { name: 'runout-who' }
  | { name: 'runout-runs'; dismissedPlayerId: PlayerId }
  | { name: 'runout-fielder'; dismissedPlayerId: PlayerId; runs: number }
  | {
      name: 'runout-crossed';
      dismissedPlayerId: PlayerId;
      runs: number;
      fielderId: PlayerId | null;
    }
  | { name: 'retired-who' };

/** docs/05-SCORER-VIEW.md § 2 — the wicket sheet: a bottom sheet over the run
    pad only, 3 taps max for the common cases. On a free hit, only RUN OUT and
    MORE → OBSTRUCTING stay enabled — everything else is visibly disabled. */
export function WicketSheet() {
  const matchState = useScorerStore((s) => s.matchState);
  const squadA = useScorerStore((s) => s.squadA);
  const squadB = useScorerStore((s) => s.squadB);
  const teamAId = useScorerStore((s) => s.teamAId);
  const recordWicket = useScorerStore((s) => s.recordWicket);
  const closeWicketSheet = useScorerStore((s) => s.closeWicketSheet);
  const [step, setStep] = useState<Step>({ name: 'root' });

  const innings = matchState?.innings[matchState.currentInningsIndex];
  if (!innings) return null;

  const fieldingSquad = innings.bowlingTeamId === teamAId ? squadA : squadB;
  const nameFor = (id: PlayerId | null) => {
    const squad = [...squadA, ...squadB];
    return (
      squad.find((p) => p.id === id)?.short_name ?? squad.find((p) => p.id === id)?.full_name ?? '—'
    );
  };

  const isFreeHit = innings.isFreeHit;

  function commit(
    type: WicketType,
    dismissedPlayerId: PlayerId,
    opts?: {
      fielderId?: PlayerId | null;
      runs?: number;
      crossedBeforeDismissal?: boolean;
    }
  ) {
    void recordWicket(
      {
        type,
        dismissedPlayerId,
        ...(opts?.fielderId ? { fielderId: opts.fielderId } : {}),
        ...(opts?.crossedBeforeDismissal !== undefined
          ? { crossedBeforeDismissal: opts.crossedBeforeDismissal }
          : {}),
      },
      opts?.runs ?? 0
    );
    setStep({ name: 'root' });
  }

  function tileDisabled(freeHitOk?: boolean) {
    return isFreeHit && !freeHitOk;
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 max-h-[60dvh] rounded-t-[var(--r-lg)] border-t border-[var(--border-default)] bg-[var(--surface-glass-strong)] px-3 pt-3 pb-[calc(var(--sp-3)+var(--safe-b))] backdrop-blur-xl">
      <div className="flex items-center justify-between pb-2">
        <span className="text-[13px] font-bold tracking-[0.04em] text-[var(--text-primary)] uppercase">
          {isFreeHit ? 'How out? · Free hit' : 'How out?'}
        </span>
        <button
          type="button"
          aria-label="Cancel"
          className="press flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
          onClick={closeWicketSheet}
        >
          ✕
        </button>
      </div>

      {step.name === 'root' && (
        <div className="grid grid-cols-3 gap-2">
          {PRIMARY.map(({ type, label, freeHitOk }) => (
            <button
              key={type}
              type="button"
              disabled={tileDisabled(freeHitOk)}
              className="press panel min-h-14 rounded-[var(--r-md)] text-[13px] font-bold disabled:pointer-events-none disabled:opacity-30"
              onClick={() => {
                if (type === 'run_out') return setStep({ name: 'runout-who' });
                if (type === 'caught') return setStep({ name: 'caught-fielder' });
                if (type === 'stumped') {
                  const keeper = fieldingSquad.find((p) => p.isWicketKeeper)?.id ?? null;
                  return commit('stumped', innings.strikerId!, { fielderId: keeper });
                }
                commit(type, innings.strikerId!);
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="press panel min-h-14 rounded-[var(--r-md)] text-[13px] font-bold"
            onClick={() => setStep({ name: 'more' })}
          >
            MORE
          </button>
        </div>
      )}

      {step.name === 'more' && (
        <div className="grid grid-cols-2 gap-2">
          {MORE_TILES.map(({ type, label, freeHitOk }) => (
            <button
              key={type}
              type="button"
              disabled={tileDisabled(freeHitOk)}
              className="press panel min-h-14 rounded-[var(--r-md)] text-[13px] font-bold disabled:pointer-events-none disabled:opacity-30"
              onClick={() => {
                if (type === 'retired_out') return setStep({ name: 'retired-who' });
                commit(type, innings.strikerId!);
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="press col-span-2 min-h-12 rounded-[var(--r-md)] text-[13px] text-[var(--text-secondary)]"
            onClick={() => setStep({ name: 'root' })}
          >
            Back
          </button>
        </div>
      )}

      {step.name === 'caught-fielder' && (
        <FielderGrid
          squad={fieldingSquad}
          onPick={(fielderId) => commit('caught', innings.strikerId!, { fielderId })}
          onBack={() => setStep({ name: 'root' })}
        />
      )}

      {step.name === 'runout-who' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="press panel min-h-16 rounded-[var(--r-md)] text-[15px] font-bold"
            onClick={() => setStep({ name: 'runout-runs', dismissedPlayerId: innings.strikerId! })}
          >
            {nameFor(innings.strikerId)}
          </button>
          <button
            type="button"
            className="press panel min-h-16 rounded-[var(--r-md)] text-[15px] font-bold"
            onClick={() =>
              setStep({ name: 'runout-runs', dismissedPlayerId: innings.nonStrikerId! })
            }
          >
            {nameFor(innings.nonStrikerId)}
          </button>
          <button
            type="button"
            className="press col-span-2 min-h-12 rounded-[var(--r-md)] text-[13px] text-[var(--text-secondary)]"
            onClick={() => setStep({ name: 'root' })}
          >
            Back
          </button>
        </div>
      )}

      {step.name === 'runout-runs' && (
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((r) => (
            <button
              key={r}
              type="button"
              className="press panel min-h-14 rounded-[var(--r-md)] text-[18px] font-bold tabular-nums"
              onClick={() =>
                setStep({
                  name: 'runout-fielder',
                  dismissedPlayerId: step.dismissedPlayerId,
                  runs: r,
                })
              }
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            className="press col-span-4 min-h-12 rounded-[var(--r-md)] text-[13px] text-[var(--text-secondary)]"
            onClick={() => setStep({ name: 'runout-who' })}
          >
            Back
          </button>
        </div>
      )}

      {step.name === 'runout-fielder' && (
        <FielderGrid
          squad={fieldingSquad}
          onPick={(fielderId) => {
            if (step.runs > 0) {
              setStep({
                name: 'runout-crossed',
                dismissedPlayerId: step.dismissedPlayerId,
                runs: step.runs,
                fielderId,
              });
            } else {
              commit('run_out', step.dismissedPlayerId, {
                fielderId,
                runs: 0,
                crossedBeforeDismissal: false,
              });
            }
          }}
          onBack={() => setStep({ name: 'runout-runs', dismissedPlayerId: step.dismissedPlayerId })}
        />
      )}

      {step.name === 'runout-crossed' && (
        <div className="grid grid-cols-2 gap-2">
          <span className="col-span-2 pb-1 text-center text-[13px] text-[var(--text-secondary)]">
            Did they cross?
          </span>
          <button
            type="button"
            className="press panel min-h-14 rounded-[var(--r-md)] text-[15px] font-bold"
            onClick={() =>
              commit('run_out', step.dismissedPlayerId, {
                fielderId: step.fielderId,
                runs: step.runs,
                crossedBeforeDismissal: true,
              })
            }
          >
            Yes
          </button>
          <button
            type="button"
            className="press panel min-h-14 rounded-[var(--r-md)] text-[15px] font-bold"
            onClick={() =>
              commit('run_out', step.dismissedPlayerId, {
                fielderId: step.fielderId,
                runs: step.runs,
                crossedBeforeDismissal: false,
              })
            }
          >
            No
          </button>
        </div>
      )}

      {step.name === 'retired-who' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="press panel min-h-16 rounded-[var(--r-md)] text-[15px] font-bold"
            onClick={() => commit('retired_out', innings.strikerId!)}
          >
            {nameFor(innings.strikerId)}
          </button>
          <button
            type="button"
            className="press panel min-h-16 rounded-[var(--r-md)] text-[15px] font-bold"
            onClick={() => commit('retired_out', innings.nonStrikerId!)}
          >
            {nameFor(innings.nonStrikerId)}
          </button>
          <button
            type="button"
            className="press col-span-2 min-h-12 rounded-[var(--r-md)] text-[13px] text-[var(--text-secondary)]"
            onClick={() => setStep({ name: 'more' })}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}

function FielderGrid({
  squad,
  onPick,
  onBack,
}: {
  squad: { id: PlayerId; short_name: string | null; full_name: string }[];
  onPick: (fielderId: PlayerId) => void;
  onBack: () => void;
}) {
  return (
    <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto">
      {squad.map((p) => (
        <button
          key={p.id}
          type="button"
          className={cn(
            'press panel flex min-h-12 items-center justify-center rounded-[var(--r-md)] px-1 text-[12px] font-semibold'
          )}
          onClick={() => onPick(p.id)}
        >
          {p.short_name ?? p.full_name}
        </button>
      ))}
      <button
        type="button"
        className="press col-span-3 min-h-12 rounded-[var(--r-md)] text-[13px] text-[var(--text-secondary)]"
        onClick={onBack}
      >
        Back
      </button>
    </div>
  );
}
