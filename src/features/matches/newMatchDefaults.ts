import { formatMatchDay } from '@/lib/format';

/**
 * Defaults for the "New match" wizard's venue/time step.
 *
 * Both fields started blank, so the quickest path through the wizard produced
 * a match with no name and no date — which is how one ended up titled "1" with
 * "1 · 8/4/2026, 1:31:00 AM" underneath it. A match is nearly always being
 * created for right now, or for a fixture whose two teams are already chosen,
 * so both have an obvious default and neither needs typing.
 *
 * Pure, and `now` is a parameter rather than a `new Date()` call inside — the
 * same rule `src/engine` lives by, for the same reason: a function that reads
 * the clock cannot be tested at a chosen moment.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * `YYYY-MM-DDTHH:mm`, which is what `<input type="datetime-local">` requires.
 *
 * Built from the local getters, not `toISOString()`. `toISOString` is UTC, so
 * for anyone east or west of Greenwich it would prefill a time that is not the
 * one on their clock — and India, where this is being built, is +5:30.
 */
export function toDateTimeLocal(now: Date): string {
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

/**
 * "TM1 v TM2 · 4 Aug 2026". Returns null when either side is unknown, so the
 * caller shows nothing rather than "undefined v undefined".
 */
export function defaultMatchTitle(
  teamAName: string | undefined,
  teamBName: string | undefined,
  now: Date
): string | null {
  if (!teamAName || !teamBName) return null;
  // With the year: a match title outlives the season it was played in.
  return `${teamAName} v ${teamBName} · ${formatMatchDay(now, true)}`;
}
