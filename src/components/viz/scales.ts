/**
 * Geometry for the hand-rolled charts: a fixed viewBox, a gridded
 * plot area, and axis labels. Everything is drawn in viewBox units and scaled
 * by CSS, so one component works from a 320px phone to a TV without a resize
 * observer or a layout pass.
 *
 * Colours come from `var(--…)` only — CLAUDE.md rule 7 — which is also why
 * these are SVG rather than a chart library: `stroke="var(--accent)"` is a
 * plain attribute here, and it re-themes on a light/dark toggle with no
 * JavaScript involved at all.
 */

export const PLOT = { width: 320, height: 180, left: 30, right: 8, top: 10, bottom: 22 };

export const plotArea = {
  x0: PLOT.left,
  x1: PLOT.width - PLOT.right,
  y0: PLOT.height - PLOT.bottom,
  y1: PLOT.top,
  get width() {
    return this.x1 - this.x0;
  },
  get height() {
    return this.y0 - this.y1;
  },
};

export type Scale = (value: number) => number;

export function makeScales(maxX: number, maxY: number): { sx: Scale; sy: Scale } {
  const spanX = maxX > 0 ? maxX : 1;
  const spanY = maxY > 0 ? maxY : 1;
  return {
    sx: (v) => plotArea.x0 + (v / spanX) * plotArea.width,
    sy: (v) => plotArea.y0 - (v / spanY) * plotArea.height,
  };
}

/** Rounded "nice" tick values so an axis reads 0/50/100, not 0/47/94. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * Both innings need distinguishable colours, but CLAUDE.md rule 7 forbids
 * inventing one here. These are existing semantic tokens, picked because they
 * are already guaranteed to read in both themes.
 */
/**
 * Ticks for an axis measured in overs.
 *
 * `niceTicks` is built for runs, where 0/50/100 is right. On the x-axis it
 * produced 0, 0.5, 1, 1.5, 2 — and there is no such thing as over 0.5. A
 * two-over match got a fractional axis for a quantity that only ever takes
 * whole values.
 *
 * Whole numbers only, and never more than `max` of them, so a 50-over innings
 * still gets a readable handful rather than fifty labels.
 */
export function overTicks(maxOvers: number, count = 4): number[] {
  const max = Math.max(1, Math.ceil(maxOvers));
  const step = Math.max(1, Math.ceil(max / count));
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  // Always land on the last over, so the axis ends where the innings does.
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

export const SERIES_COLOURS = ['var(--accent)', 'var(--run-six)'] as const;
