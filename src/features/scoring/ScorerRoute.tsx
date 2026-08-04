import { useEffect } from 'react';
import { useParams } from 'react-router';
import { cn } from '@/lib/cn';
import { useScorerStore } from './store';
import { StatusStrip } from './components/StatusStrip';
import { ScoreBlock } from './components/ScoreBlock';
import { BattersRow } from './components/BattersRow';
import { BowlerRow } from './components/BowlerRow';
import { OverStrip } from './components/OverStrip';
import { RunPad } from './components/RunPad';
import { ShotPrompt } from './components/ShotPrompt';
import { ModifierRow } from './components/ModifierRow';
import { ActionRow } from './components/ActionRow';
import { WicketSheet } from './components/WicketSheet';
import { BallHistorySheet } from './components/BallHistorySheet';
import { OpenersPicker } from './components/OpenersPicker';
import { BowlerPicker } from './components/BowlerPicker';
import { BatterPicker } from './components/BatterPicker';
import { InningsBreakScreen } from './components/InningsBreakScreen';
import { InningsNotStartedScreen } from './components/InningsNotStartedScreen';
import { PadUnavailable } from './components/PadUnavailable';
import { MatchOverScreen } from './components/MatchOverScreen';
import { MergeScreen } from './components/MergeScreen';
import { ScorerTabs } from './components/ScorerTabs';
import { ScorecardTab } from './components/ScorecardTab';
import { MapTab } from './components/MapTab';
import { FeedTab } from './components/FeedTab';
import { SettingsTab } from './components/SettingsTab';

/**
 * PHASE 5 — the scorer view. docs/05-SCORER-VIEW.md § 1.
 *
 *   28px  status strip      →  <StatusStrip />
 *   92px  score block       →  <ScoreBlock />
 *   44px  batters           →  <BattersRow />
 *   36px  bowler            →  <BowlerRow />
 *   40px  over dots         →  <OverStrip />
 *  ~168px run pad / picker  →  <RunPad /> or the AWAITING_* picker
 *   56px  modifiers         →  <ModifierRow />
 *   64px  actions           →  <ActionRow />
 *   56px  tab bar           →  <ScorerTabs />
 *
 * The Score tab is this whole stack; Scorecard/Map/Feed/Settings (docs § 7)
 * replace it entirely below the status strip and scroll freely — only the
 * pad itself is under the zero-scroll rule.
 */
export default function ScorerRoute() {
  const { matchId } = useParams();
  const init = useScorerStore((s) => s.init);
  const mode = useScorerStore((s) => s.mode);
  const error = useScorerStore((s) => s.error);
  const revoked = useScorerStore((s) => s.revoked);
  const dismissError = useScorerStore((s) => s.dismissError);
  const scorerTab = useScorerStore((s) => s.scorerTab);
  const duplicateWarning = useScorerStore((s) => s.duplicateWarning);
  const dismissDuplicateWarning = useScorerStore((s) => s.dismissDuplicateWarning);
  const undo = useScorerStore((s) => s.undo);
  const conflict = useScorerStore((s) => s.conflict);
  const softLock = useScorerStore((s) => s.softLock);
  const matchState = useScorerStore((s) => s.matchState);
  const config = useScorerStore((s) => s.config);

  // Every component below returns null without these, so without this gate the
  // Score tab's failure mode is a black rectangle with WICKET and UNDO in it.
  // See `PadUnavailable`.
  const padReady = Boolean(
    matchState && config && matchState.innings[matchState.currentInningsIndex]
  );

  useEffect(() => {
    if (matchId) void init(matchId);
  }, [matchId, init]);

  if (mode === 'LOADING') {
    return <CenteredMessage>Loading match…</CenteredMessage>;
  }
  if (mode === 'ERROR') {
    return <CenteredMessage>{error ?? 'Something went wrong.'}</CenteredMessage>;
  }
  if (conflict) {
    return (
      <div className="flex h-full flex-col">
        <StatusStrip />
        <MergeScreen />
      </div>
    );
  }
  if (mode === 'NOT_STARTED') {
    return (
      <div className="flex h-full flex-col">
        <StatusStrip />
        <InningsNotStartedScreen />
      </div>
    );
  }
  if (mode === 'INNINGS_BREAK') {
    return (
      <div className="flex h-full flex-col">
        <StatusStrip />
        <InningsBreakScreen />
      </div>
    );
  }
  if (mode === 'MATCH_OVER') {
    return (
      <div className="flex h-full flex-col">
        <StatusStrip />
        <MatchOverScreen />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <StatusStrip />

      {scorerTab === 'score' && !padReady && <PadUnavailable />}

      {scorerTab === 'score' && padReady && (
        <>
          <ScoreBlock />
          <BattersRow />
          <BowlerRow />
          <OverStrip />

          <div
            className={cn(
              'relative flex min-h-0 flex-1 flex-col',
              (revoked || softLock) && 'pointer-events-none opacity-40'
            )}
          >
            {mode === 'AWAITING_OPENERS' && <OpenersPicker />}
            {mode === 'AWAITING_BOWLER' && <BowlerPicker />}
            {mode === 'AWAITING_BATTER' && <BatterPicker />}
            {(mode === 'READY' || mode === 'WICKET_SHEET' || mode === 'READ_ONLY') && (
              <>
                <RunPad />
                <ModifierRow />
              </>
            )}
            {mode === 'WICKET_SHEET' && <WicketSheet />}
            {/* A sibling of the sheets, not a child of RunPad. It lived inside
                the pad's own ~168px box with `absolute inset-0`, so the field
                diagram overflowed and was clipped by the no-scroll shell —
                reported as the wagon wheel prompt "never came on singles".
                It was rendering; there was nowhere for it to render. */}
            <ShotPrompt />
            <BallHistorySheet />
          </div>

          <ActionRow />
        </>
      )}
      {scorerTab === 'scorecard' && <ScorecardTab />}
      {scorerTab === 'map' && <MapTab />}
      {scorerTab === 'feed' && <FeedTab />}
      {scorerTab === 'settings' && <SettingsTab />}

      <ScorerTabs />

      {revoked && (
        <div className="absolute inset-x-3 bottom-20 z-30 rounded-[var(--r-md)] bg-[var(--danger)] px-3 py-2 text-center text-[13px] font-semibold text-white">
          Your scoring rights were revoked.
        </div>
      )}
      {softLock && !revoked && scorerTab === 'score' && (
        <div className="absolute inset-x-3 bottom-20 z-30 rounded-[var(--r-md)] bg-[var(--surface-glass-strong)] px-3 py-2 text-center text-[13px] font-semibold text-[var(--text-primary)] backdrop-blur-xl">
          {softLock.displayName} is {softLock.action}…
        </div>
      )}
      {duplicateWarning && !revoked && scorerTab === 'score' && (
        <div className="absolute inset-x-3 bottom-20 z-30 flex items-center justify-between gap-2 rounded-[var(--r-md)] bg-[var(--surface-glass-strong)] px-3 py-2 text-[13px] backdrop-blur-xl">
          <span className="text-[var(--text-secondary)]">Recorded twice?</span>
          <div className="flex gap-3">
            <button
              type="button"
              className="press font-semibold text-[var(--accent)]"
              onClick={() => {
                dismissDuplicateWarning();
                void undo();
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="press text-[var(--text-tertiary)]"
              onClick={dismissDuplicateWarning}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {error && !revoked && (
        <button
          type="button"
          className="press absolute inset-x-3 bottom-20 z-30 rounded-[var(--r-md)] bg-[var(--surface-glass-strong)] px-3 py-2 text-center text-[13px] font-semibold text-[var(--danger)] backdrop-blur-xl"
          onClick={dismissError}
        >
          {error} · tap to dismiss
        </button>
      )}
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-5 text-center text-[15px] text-[var(--text-secondary)]">
      {children}
    </div>
  );
}
