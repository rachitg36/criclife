import type { ReactNode } from 'react';
import { PLOT, plotArea, type Scale } from './scales';

/**
 * Shared plot frame: a fixed viewBox, a gridded plot area, and axis labels.
 * Everything is drawn in viewBox units and scaled by CSS, so one component
 * works from a 320px phone to a TV with no resize observer and no layout pass.
 * The scales themselves live in `./scales` — they are also used by callers
 * that never render this frame.
 */

export function ChartFrame({
  title,
  description,
  yTicks,
  xTicks,
  sx,
  sy,
  legend,
  empty,
  children,
}: {
  title: string;
  description: string;
  yTicks: number[];
  xTicks: number[];
  sx: Scale;
  sy: Scale;
  legend?: ReactNode;
  empty?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel rounded-[var(--r-lg)] p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-[var(--text-heading-sm)] font-semibold">{title}</h3>
        {legend}
      </div>
      <p className="mb-2 text-[11px] text-[var(--text-tertiary)]">{description}</p>

      {empty ? (
        <p className="py-8 text-center text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
          {empty}
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
          className="w-full"
          role="img"
          aria-label={`${title}. ${description}`}
        >
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line
                x1={plotArea.x0}
                x2={plotArea.x1}
                y1={sy(t)}
                y2={sy(t)}
                stroke="var(--border-subtle)"
                strokeWidth={0.75}
              />
              <text
                x={plotArea.x0 - 4}
                y={sy(t) + 3}
                textAnchor="end"
                fontSize={8}
                fill="var(--text-tertiary)"
              >
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={`x${t}`}
              x={sx(t)}
              y={plotArea.y0 + 12}
              textAnchor="middle"
              fontSize={8}
              fill="var(--text-tertiary)"
            >
              {t}
            </text>
          ))}
          {children}
        </svg>
      )}
    </section>
  );
}

/** Two swatches — used wherever both innings are drawn on one plot. */
export function SeriesLegend({ items }: { items: { label: string; colour: string }[] }) {
  return (
    <ul className="flex shrink-0 items-center gap-2.5">
      {items.map((i) => (
        <li
          key={i.label}
          className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: i.colour }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
