import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyError, userMessage } from '@/lib/errors';
import {
  addBreadcrumb,
  getBreadcrumbs,
  reportError,
  resetMonitoring,
  setErrorSink,
} from '@/lib/monitoring';
import type { AppError } from '@/lib/errors';

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

afterEach(() => {
  setOnline(true);
  resetMonitoring();
  vi.restoreAllMocks();
});

describe('classifyError', () => {
  it('recognises a browser fetch failure as a network problem', () => {
    expect(classifyError(new Error('Failed to fetch')).kind).toBe('network');
  });

  it('calls it offline when the browser says so', () => {
    setOnline(false);
    expect(classifyError(new Error('Failed to fetch')).kind).toBe('offline');
  });

  it('maps HTTP statuses onto kinds', () => {
    const kindOf = (status: number) => classifyError({ message: 'x', status }).kind;
    expect(kindOf(401)).toBe('auth');
    expect(kindOf(403)).toBe('permission');
    expect(kindOf(404)).toBe('not_found');
    expect(kindOf(409)).toBe('conflict');
    expect(kindOf(422)).toBe('validation');
    expect(kindOf(500)).toBe('server');
    expect(kindOf(503)).toBe('server');
    expect(kindOf(0)).toBe('network');
  });

  it('keeps a scoring RPC code rather than flattening it', () => {
    const stale = classifyError(new Error('STALE_SEQ: someone else scored'));
    expect(stale.kind).toBe('conflict');
    expect(stale.message).toMatch(/scored a ball first/);

    const grant = classifyError({ message: 'NO_GRANT', status: 403 });
    expect(grant.kind).toBe('permission');
    expect(grant.message).toMatch(/no longer hold scoring rights/);
  });

  it('prefers a domain code over the status it arrived with', () => {
    // A 500 carrying a known code is still that code's meaning.
    expect(classifyError({ message: 'BOWLER_LIMIT', status: 500 }).kind).toBe('validation');
  });

  it('never surfaces an empty body as the explanation', () => {
    for (const message of ['{}', '', '   ', '[object Object]', 'null']) {
      const out = userMessage({ message, status: 500 });
      expect(out).not.toBe(message);
      expect(out).toMatch(/server/i);
    }
  });

  it('shows a 4xx server sentence but never a 5xx one', () => {
    expect(userMessage({ message: 'Email rate limit exceeded', status: 429 })).toBe(
      'Email rate limit exceeded'
    );
    expect(userMessage({ message: 'pq: deadlock detected', status: 500 })).toMatch(
      /not something you can fix/
    );
  });

  it('keeps the raw text as detail even when it is not shown', () => {
    expect(classifyError({ message: 'pq: deadlock detected', status: 500 }).detail).toBe(
      'pq: deadlock detected'
    );
  });

  it('marks the kinds that are worth retrying', () => {
    expect(classifyError(new Error('Failed to fetch')).retryable).toBe(true);
    expect(classifyError({ message: 'nope', status: 403 }).retryable).toBe(false);
  });

  it('handles a bare string and a plain object', () => {
    expect(classifyError('Failed to fetch').kind).toBe('network');
    expect(classifyError({}).kind).toBe('unknown');
    expect(classifyError(undefined).kind).toBe('unknown');
  });
});

describe('reportError', () => {
  it('returns the classification so screen and log cannot disagree', () => {
    const seen: AppError[] = [];
    setErrorSink((e) => seen.push(e));
    const out = reportError({ message: 'NO_GRANT', status: 403 });
    expect(out.kind).toBe('permission');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.kind).toBe('permission');
  });

  it('does not report a dropped connection — it is expected at a cricket ground', () => {
    const seen: AppError[] = [];
    setErrorSink((e) => seen.push(e));
    reportError(new Error('Failed to fetch'));
    setOnline(false);
    reportError(new Error('Failed to fetch'));
    expect(seen).toHaveLength(0);
  });

  it('passes context through to the sink', () => {
    const contexts: Record<string, unknown>[] = [];
    setErrorSink((_e, c) => contexts.push(c));
    reportError({ message: 'boom', status: 500 }, { matchId: 'm1' });
    expect(contexts[0]).toMatchObject({ matchId: 'm1' });
  });

  it('keeps only the most recent breadcrumbs', () => {
    for (let i = 0; i < 30; i += 1) addBreadcrumb(`step ${i}`);
    const crumbs = getBreadcrumbs();
    expect(crumbs).toHaveLength(20);
    expect(crumbs[crumbs.length - 1]!.message).toBe('step 29');
    expect(crumbs[0]!.message).toBe('step 10');
  });
});
