/**
 * docs/12 Phase 9 — "error taxonomy".
 *
 * One place that turns anything thrown anywhere in the app into a small,
 * closed set of kinds, each with a sentence a cricketer can act on. The point
 * is not tidiness: it is that the app already had two separate places putting
 * raw machine text on screen ("Failed to fetch", a literal `{}`), and both
 * were found by a human staring at a broken login rather than by a test.
 *
 * Pure and framework-free, so the classification is unit-testable without
 * rendering anything.
 */

export type ErrorKind =
  /** No connection, DNS failure, request never left the device. */
  | 'offline'
  /** Reached the network, but the server never answered usefully. */
  | 'network'
  /** The server answered with a 5xx. Nothing the user can do. */
  | 'server'
  /** Signed out, or the session expired mid-action. */
  | 'auth'
  /** Signed in, but not allowed to do this. */
  | 'permission'
  /** Asked for something that isn't there. */
  | 'not_found'
  /** Someone else changed the thing first — the scorer's merge case. */
  | 'conflict'
  /** The input was refused by a business rule (an illegal dismissal, say). */
  | 'validation'
  /** Genuinely unexpected. */
  | 'unknown';

export type AppError = {
  kind: ErrorKind;
  /** Shown to the user. Always a full sentence, never a machine string. */
  message: string;
  /** The original text, kept for logs and bug reports — never rendered raw. */
  detail: string | null;
  /** HTTP status where there was one. */
  status: number | null;
  /** Whether trying again, unchanged, could plausibly work. */
  retryable: boolean;
};

const NETWORK_PATTERN = /failed to fetch|networkerror|load failed|network request failed|aborted/i;

/**
 * Server error codes the scoring RPCs raise (docs/10 § 3.1). These already
 * have meanings the app knows how to act on, so they must survive
 * classification rather than being flattened into "something went wrong".
 */
const DOMAIN_CODES: Record<string, { kind: ErrorKind; message: string }> = {
  NO_GRANT: {
    kind: 'permission',
    message: 'You no longer hold scoring rights for this match.',
  },
  MATCH_LOCKED: {
    kind: 'permission',
    message: 'This match is complete and can no longer be scored.',
  },
  STALE_SEQ: {
    kind: 'conflict',
    message: 'Someone else scored a ball first. Your entries need merging.',
  },
  INNINGS_COMPLETE: { kind: 'conflict', message: 'That innings has already ended.' },
  ILLEGAL_DISMISSAL: { kind: 'validation', message: 'That dismissal is not legal on this ball.' },
  BOWLER_LIMIT: { kind: 'validation', message: 'That bowler has reached their over limit.' },
  CONSECUTIVE_OVER: { kind: 'validation', message: 'A bowler cannot bowl two overs in a row.' },
  NO_PERMISSION: { kind: 'permission', message: "You don't have permission to do that." },
  MATCH_NOT_FOUND: { kind: 'not_found', message: 'That match no longer exists.' },
};

const BY_KIND: Record<ErrorKind, { message: string; retryable: boolean }> = {
  offline: {
    message: "You're offline. This will go through once you have signal again.",
    retryable: true,
  },
  network: {
    message: "Couldn't reach the server. Check your connection and try again.",
    retryable: true,
  },
  server: {
    message: 'Something went wrong on the server. This is not something you can fix.',
    retryable: true,
  },
  auth: { message: 'You need to sign in again to do that.', retryable: false },
  permission: { message: "You don't have permission to do that.", retryable: false },
  not_found: { message: "That doesn't exist, or has been removed.", retryable: false },
  conflict: {
    message: 'Someone else changed this first. Reload to see the latest.',
    retryable: false,
  },
  validation: { message: "That isn't allowed here.", retryable: false },
  unknown: { message: 'Something went wrong. Try again in a moment.', retryable: true },
};

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function textOf(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return null;
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return null;
}

/**
 * A body carrying no usable text is worse than none: it once put a literal
 * red `{}` on the login screen as the entire explanation.
 */
function isUninformative(text: string | null): boolean {
  if (text === null) return true;
  const t = text.trim();
  return (
    t === '' ||
    t === '{}' ||
    t === '[]' ||
    t === 'null' ||
    t === 'undefined' ||
    t === '[object Object]'
  );
}

function kindFromStatus(status: number): ErrorKind {
  if (status === 0) return 'network';
  if (status === 401) return 'auth';
  if (status === 403) return 'permission';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'validation';
  if (status >= 500) return 'server';
  if (status >= 400) return 'validation';
  return 'unknown';
}

export function classifyError(error: unknown): AppError {
  const detail = textOf(error);
  const status = statusOf(error);

  // A recognised domain code wins over everything: it is the most specific
  // thing anyone knows about this failure.
  if (detail) {
    for (const [code, spec] of Object.entries(DOMAIN_CODES)) {
      if (detail.includes(code)) {
        return {
          kind: spec.kind,
          message: spec.message,
          detail,
          status,
          retryable: BY_KIND[spec.kind].retryable,
        };
      }
    }
  }

  if (status === 0 || (detail !== null && NETWORK_PATTERN.test(detail))) {
    const kind: ErrorKind = isOffline() ? 'offline' : 'network';
    return { kind, message: BY_KIND[kind].message, detail, status, retryable: true };
  }

  if (status !== null) {
    const kind = kindFromStatus(status);
    // A 4xx usually carries a sentence worth showing; a 5xx never does.
    const useDetail = kind !== 'server' && !isUninformative(detail);
    // The status rides along on the messages the user cannot act on, so a bug
    // report carries something specific even when the screen deliberately does
    // not show the raw server text.
    const suffix = useDetail ? '' : ` (error ${status})`;
    return {
      kind,
      message: useDetail ? detail! : `${BY_KIND[kind].message}${suffix}`,
      detail,
      status,
      retryable: BY_KIND[kind].retryable,
    };
  }

  if (isUninformative(detail)) {
    const kind: ErrorKind = isOffline() ? 'offline' : 'unknown';
    return { kind, message: BY_KIND[kind].message, detail, status: null, retryable: true };
  }

  return { kind: 'unknown', message: detail!, detail, status: null, retryable: true };
}

/** The sentence to put on screen. Never returns machine text. */
export function userMessage(error: unknown): string {
  return classifyError(error).message;
}
