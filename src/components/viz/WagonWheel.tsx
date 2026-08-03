import type { WagonShot } from '@/features/audience/chartData';

/**
 * docs/06 § 2 — a circular field with shot lines coloured by runs, filterable
 * per batter.
 *
 * Only balls scored in Advanced Mode carry coordinates (docs/05 § 8 — off by
 * default), so for most matches this has nothing to draw. It says so plainly
 * rather than rendering an empty field, which reads as broken.
 *
 * Coordinates are normalised to -1..1 with the batter at the origin and the
 * bowler's end at negative y, matching the `shot: {x, y}` the scorer captures.
 */
const R = 90;
const CX = 100;
const CY = 100;

export function WagonWheel({
  shots,
  nameOf,
  batters,
  selected,
  onSelect,
}: {
  shots: WagonShot[];
  nameOf: (id: string) => string;
  batters: string[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <section className="panel rounded-[var(--r-lg)] p-3">
      <h3 className="text-[var(--text-heading-sm)] font-semibold">Wagon wheel</h3>
      <p className="mb-2 text-[11px] text-[var(--text-tertiary)]">
        Where the runs went. Needs Advanced Mode scoring.
      </p>

      {batters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <FilterChip active={selected === null} onClick={() => onSelect(null)}>
            All
          </FilterChip>
          {batters.map((id) => (
            <FilterChip key={id} active={selected === id} onClick={() => onSelect(id)}>
              {nameOf(id)}
            </FilterChip>
          ))}
        </div>
      )}

      {shots.length === 0 ? (
        <p className="py-6 text-center text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
          No shot data for this innings — the scorer didn&apos;t use Advanced Mode.
        </p>
      ) : (
        <svg
          viewBox="0 0 200 200"
          className="mx-auto w-full max-w-[260px]"
          role="img"
          aria-label={`Wagon wheel with ${shots.length} scoring shots`}
        >
          <circle cx={CX} cy={CY} r={R} fill="var(--surface-2)" stroke="var(--border-default)" />
          <circle
            cx={CX}
            cy={CY}
            r={R * 0.55}
            fill="none"
            stroke="var(--border-subtle)"
            strokeDasharray="2 3"
          />
          <rect
            x={CX - 4}
            y={CY - 16}
            width={8}
            height={32}
            rx={1}
            fill="var(--surface-3)"
            stroke="var(--border-subtle)"
            strokeWidth={0.5}
          />
          {shots.map((s) => (
            <line
              key={s.key}
              x1={CX}
              y1={CY}
              x2={CX + s.x * R}
              y2={CY + s.y * R}
              stroke={runColour(s.runs)}
              strokeWidth={s.runs >= 4 ? 1.6 : 1}
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}
        </svg>
      )}
    </section>
  );
}

function runColour(runs: number): string {
  if (runs >= 6) return 'var(--run-six)';
  if (runs >= 4) return 'var(--run-four)';
  if (runs >= 2) return 'var(--run-single)';
  return 'var(--run-dot)';
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'press rounded-[var(--r-full)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-fg)]'
          : 'press rounded-[var(--r-full)] border border-[var(--border-default)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]'
      }
    >
      {children}
    </button>
  );
}
