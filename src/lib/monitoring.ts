import { env } from './env';
import { classifyError, type AppError } from './errors';

/**
 * docs/12 Phase 9 — "Sentry, analytics, error taxonomy".
 *
 * **`@sentry/react` is deliberately NOT a dependency.** Three reasons, and
 * they are worth stating because the roadmap asks for Sentry by name:
 *
 *   1. `/live/:publicSlug` has ~1.6 kB of headroom against its 180 kB budget
 *      (CLAUDE.md rule 9). Sentry's browser SDK is an order of magnitude more
 *      than that, and error reporting has to load on *every* route to be
 *      worth anything, so it cannot hide behind a lazy boundary the way the
 *      charts do.
 *   2. There is no DSN. `VITE_SENTRY_DSN` has been empty since Phase 0 and
 *      docs/14 § 7 still lists creating the project as an open human task, so
 *      the wiring could not be verified even once here.
 *   3. Adding an unverifiable dependency to satisfy a checklist is how a
 *      bundle budget dies.
 *
 * So this is the seam rather than the vendor. Everything reports through
 * `reportError`; attaching Sentry later is a `setErrorSink` call in
 * `main.tsx` and nothing else changes. See HANDOFF § 6.1.
 */

export type ErrorContext = Record<string, string | number | boolean | null>;

export type ErrorSink = (error: AppError, context: ErrorContext) => void;

/** Recent user actions, attached to whatever fails next. */
const breadcrumbs: { at: number; message: string }[] = [];
const MAX_BREADCRUMBS = 20;

let sink: ErrorSink | null = null;

export function setErrorSink(next: ErrorSink | null): void {
  sink = next;
}

export function addBreadcrumb(message: string): void {
  breadcrumbs.push({ at: Date.now(), message });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

export function getBreadcrumbs(): readonly { at: number; message: string }[] {
  return breadcrumbs;
}

/** Test seam — the module holds process-wide state. */
export function resetMonitoring(): void {
  breadcrumbs.length = 0;
  sink = null;
}

/**
 * Reports a failure and hands back the classified form, so a caller can do
 * `setMessage(reportError(e).message)` and be sure the thing on screen and the
 * thing in the log are the same thing.
 */
export function reportError(error: unknown, context: ErrorContext = {}): AppError {
  const classified = classifyError(error);

  // Expected, self-explanatory conditions are not incidents. Reporting every
  // dropped connection at a cricket ground would bury the real bugs.
  const worthReporting = classified.kind !== 'offline' && classified.kind !== 'network';

  if (worthReporting) {
    if (sink) {
      sink(classified, { ...context, breadcrumbs: breadcrumbs.length });
    } else if (env.VITE_APP_ENV === 'local') {
      // No sink configured: in local dev say so loudly, in production stay
      // quiet rather than filling a user's console with noise they cannot use.
      console.error(
        '[criclife]',
        classified.kind,
        classified.detail ?? classified.message,
        context
      );
    }
  }

  return classified;
}
