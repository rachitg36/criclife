import { useParams } from 'react-router';

/**
 * PHASE 5 — the scorer view.
 *
 * This stub deliberately reproduces the real layout budget from
 * docs/05-SCORER-VIEW.md § 1 so the no-scroll Playwright assertion is
 * meaningful from Phase 0 onward. Each band below becomes a real component:
 *
 *   28px  status strip      →  <StatusStrip />
 *   92px  score block       →  <ScoreBlock />
 *   44px  batters           →  <BattersRow />
 *   36px  bowler            →  <BowlerRow />
 *   40px  over dots         →  <OverStrip />
 *  ~168px run pad           →  <RunPad />
 *   56px  modifiers         →  <ModifierRow />
 *   64px  actions           →  <ActionRow />
 *   56px  tab bar           →  <ScorerTabs />
 *
 * Total ≈ 596px, fitting a 375×667 device with room for safe areas.
 */
export default function ScorerRoute() {
  const { matchId } = useParams();

  return (
    <div className="flex h-full flex-col">
      <Band h={28} label="Status strip" />
      <Band h={92} label="Score block" grow={false} />
      <Band h={44} label="Batters" />
      <Band h={36} label="Bowler" />
      <Band h={40} label="This over" />

      {/* The run pad flexes — it absorbs extra height on taller phones
          rather than letting anything spill off the bottom. */}
      <div className="flex min-h-0 flex-1 items-center justify-center border-y border-dashed border-[var(--border-subtle)]">
        <div className="grid grid-cols-4 gap-2 p-3">
          {['0', '1', '2', '3', '4', '6', '5', '7+'].map((n) => (
            <div
              key={n}
              className="panel flex h-14 w-14 items-center justify-center text-[20px] font-bold"
            >
              {n}
            </div>
          ))}
        </div>
      </div>

      <Band h={56} label="Wide · No-ball · Bye · Leg bye" />
      <Band h={64} label="Wicket · Undo · More" />
      <Band h={56} label="Score · Card · Map · Feed · Settings" />

      <div className="px-3 pb-1 text-center text-[10px] text-[var(--text-tertiary)]">
        Phase 5 stub · match {matchId ?? '—'} · docs/05-SCORER-VIEW.md
      </div>
    </div>
  );
}

function Band({ h, label, grow = false }: { h: number; label: string; grow?: boolean }) {
  return (
    <div
      style={{ height: grow ? undefined : h, minHeight: h }}
      className="flex shrink-0 items-center justify-center border-b border-[var(--border-subtle)] text-[11px] tracking-[0.06em] text-[var(--text-tertiary)] uppercase"
    >
      {label}
    </div>
  );
}
