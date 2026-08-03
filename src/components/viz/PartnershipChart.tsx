import type { PartnershipBar } from '@/features/audience/chartData';

/**
 * docs/06 § 2 — horizontal stacked bars, each batter's contribution shown
 * separately. Extras in a stand are real runs but belong to neither batter, so
 * they get their own muted segment rather than being silently attributed to
 * whoever was on strike.
 *
 * Plain divs rather than SVG: this one is a list of proportional bars, which
 * flexbox does natively and accessibly, and text inside SVG does not wrap.
 */
export function PartnershipChart({
  bars,
  nameOf,
}: {
  bars: PartnershipBar[];
  nameOf: (id: string) => string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.runs));

  return (
    <section className="panel rounded-[var(--r-lg)] p-3">
      <h3 className="text-[var(--text-heading-sm)] font-semibold">Partnerships</h3>
      <p className="mb-3 text-[11px] text-[var(--text-tertiary)]">
        Each stand, split by who scored the runs.
      </p>

      {bars.length === 0 ? (
        <p className="py-6 text-center text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
          No partnerships yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {bars.map((bar) => {
            const attributed = bar.batters.reduce((sum, b) => sum + b.runs, 0);
            const extras = Math.max(0, bar.runs - attributed);
            return (
              <li key={bar.wicketNumber}>
                <div className="mb-1 flex items-baseline gap-2 text-[11px]">
                  <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">
                    {bar.wicketNumber}
                    {ordinal(bar.wicketNumber)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                    {bar.batters.map((b) => nameOf(b.playerId)).join(' & ')}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {bar.runs}
                    {bar.unbroken && '*'}
                    <span className="ml-1 font-normal text-[var(--text-tertiary)]">
                      ({bar.legalBalls})
                    </span>
                  </span>
                </div>
                <div
                  className="flex h-3 overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-3)]"
                  style={{ width: `${Math.max(6, (bar.runs / max) * 100)}%` }}
                  role="img"
                  aria-label={`${bar.runs} runs, ${bar.batters
                    .map((b) => `${nameOf(b.playerId)} ${b.runs}`)
                    .join(', ')}${extras > 0 ? `, extras ${extras}` : ''}`}
                >
                  {bar.batters.map((b, i) => (
                    <span
                      key={b.playerId}
                      className={i === 0 ? 'bg-[var(--accent)]' : 'bg-[var(--run-six)]'}
                      style={{ width: `${bar.runs > 0 ? (b.runs / bar.runs) * 100 : 0}%` }}
                    />
                  ))}
                  {extras > 0 && (
                    <span
                      className="bg-[var(--extra)] opacity-60"
                      style={{ width: `${(extras / bar.runs) * 100}%` }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}
