import { afterEach, describe, expect, it } from 'vitest';
import { humanAuthError } from '@/features/auth/authErrors';

/**
 * Written after the login form was actually driven against an unreachable
 * Supabase project and put the browser's raw "Failed to fetch" on screen.
 */

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

afterEach(() => setOnline(true));

describe('humanAuthError', () => {
  it("rewrites the browser's raw fetch failure", () => {
    expect(humanAuthError({ message: 'Failed to fetch' })).toMatch(/Check your connection/);
  });

  it("recognises the other engines' wordings for the same failure", () => {
    for (const message of [
      'Load failed',
      'NetworkError when attempting to fetch resource',
      'Network request failed',
    ]) {
      expect(humanAuthError({ message, status: 500 })).toMatch(/Check your connection/);
    }
  });

  it('says "offline" when the browser knows it is offline', () => {
    setOnline(false);
    expect(humanAuthError({ message: 'Failed to fetch' })).toMatch(/You're offline/);
  });

  it('rewrites a status-0 failure whatever it says', () => {
    expect(humanAuthError({ message: 'anything at all', status: 0 })).toMatch(
      /Check your connection/
    );
  });

  it('never shows an empty error body as the explanation', () => {
    // Regression guard: the login screen once displayed a literal red "{}"
    // as the entire reason sign-in had failed.
    for (const message of ['{}', '', '   ', '[]', 'null', 'undefined', '[object Object]']) {
      const out = humanAuthError({ message, status: 500 });
      expect(out).toMatch(/failing on the server/);
      expect(out).toContain('error 500');
    }
  });

  it('omits the code when there is no status to report', () => {
    expect(humanAuthError({ message: '{}' })).toMatch(/failing on the server\. This is not/);
  });

  it('does NOT treat a missing status as a network failure', () => {
    // Regression guard. An earlier version of this helper did, and swallowed
    // real server messages whose mock simply had no status on it.
    expect(humanAuthError({ message: 'Email rate limit exceeded' })).toBe(
      'Email rate limit exceeded'
    );
  });

  it('passes a real auth error through untouched', () => {
    expect(humanAuthError({ message: 'Email rate limit exceeded', status: 429 })).toBe(
      'Email rate limit exceeded'
    );
    expect(humanAuthError({ message: 'Invalid login credentials', status: 400 })).toBe(
      'Invalid login credentials'
    );
  });

  it('does not swallow a server error that has a real status and a real message', () => {
    expect(humanAuthError({ message: 'Signups not allowed for this instance', status: 422 })).toBe(
      'Signups not allowed for this instance'
    );
  });
});
