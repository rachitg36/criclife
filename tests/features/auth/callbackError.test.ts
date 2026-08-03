import { describe, expect, it } from 'vitest';
import {
  describeExchangeFailure,
  hasAuthPayload,
  parseCallbackError,
} from '@/features/auth/callbackError';

/**
 * Written against the URLs Supabase actually redirects to. The callback screen
 * previously ignored all of these and showed one guess for every failure.
 */
const BASE = 'http://localhost:5173/auth/callback';

describe('parseCallbackError', () => {
  it('finds nothing in a clean callback', () => {
    expect(parseCallbackError(`${BASE}?code=abc`)).toBeNull();
  });

  it('reads an error from the query string (PKCE flow)', () => {
    const e = parseCallbackError(
      `${BASE}?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    );
    expect(e?.code).toBe('otp_expired');
    expect(e?.message).toBe('Email link is invalid or has expired');
    expect(e?.hint).toMatch(/short-lived/);
  });

  it('reads an error from the hash fragment (implicit flow)', () => {
    const e = parseCallbackError(
      `${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`
    );
    expect(e?.code).toBe('otp_expired');
    expect(e?.message).toBe('Email link is invalid');
  });

  it('explains the same-browser requirement for a missing PKCE verifier', () => {
    const e = parseCallbackError(`${BASE}?error=invalid_request&error_code=flow_state_not_found`);
    expect(e?.hint).toMatch(/same browser/);
  });

  it('explains a redirect-URL mismatch rather than blaming the link', () => {
    const e = parseCallbackError(`${BASE}?error=invalid_request&error_code=validation_failed`);
    expect(e?.hint).toMatch(/redirect URL/);
  });

  it('still reports an error that carries no description', () => {
    const e = parseCallbackError(`${BASE}?error=server_error`);
    expect(e?.code).toBe('server_error');
    expect(e?.message).toBe('That sign-in link could not be used.');
  });

  it('falls back to the error name when there is no error_code', () => {
    expect(parseCallbackError(`${BASE}?error=access_denied`)?.code).toBe('access_denied');
  });

  it('has no hint for a code it does not recognise, rather than inventing one', () => {
    const e = parseCallbackError(`${BASE}?error_code=something_new&error_description=Nope`);
    expect(e?.message).toBe('Nope');
    expect(e?.hint).toBeNull();
  });

  it('survives a malformed URL', () => {
    expect(parseCallbackError('not a url')).toBeNull();
  });
});

describe('describeExchangeFailure', () => {
  // The case the URL can never show: GoTrue redirected fine, and supabase-js
  // then failed to trade the code for a session.
  it('explains an exchange failure that left no trace in the URL', () => {
    const e = describeExchangeFailure({
      message: 'invalid request: both auth code and code verifier should be non-empty',
      status: 400,
    });
    expect(e.message).toMatch(/code verifier/);
    expect(e.hint).toMatch(/same browser/);
    expect(e.code).toBe('http_400');
  });

  it('prefers a named error code over the HTTP status', () => {
    expect(
      describeExchangeFailure({ message: 'nope', code: 'bad_code_verifier', status: 400 }).code
    ).toBe('bad_code_verifier');
  });

  it('reuses the redirect hints when the code is one it already knows', () => {
    expect(describeExchangeFailure({ message: 'x', code: 'otp_expired' }).hint).toMatch(
      /short-lived/
    );
  });

  it('never shows an empty message as the reason', () => {
    expect(describeExchangeFailure({ message: '   ' }).message).toBe(
      'That sign-in link could not be used.'
    );
  });

  it('has no code to show when there is neither a code nor a status', () => {
    expect(describeExchangeFailure({ message: 'x' }).code).toBeNull();
  });
});

describe('hasAuthPayload', () => {
  it('recognises a PKCE code', () => {
    expect(hasAuthPayload(`${BASE}?code=abc`)).toBe(true);
  });

  it('recognises a token hash and an implicit access token', () => {
    expect(hasAuthPayload(`${BASE}?token_hash=abc`)).toBe(true);
    expect(hasAuthPayload(`${BASE}#access_token=abc&type=magiclink`)).toBe(true);
  });

  it('is false for a bare callback — nothing was ever handed over', () => {
    expect(hasAuthPayload(BASE)).toBe(false);
  });

  it('is false for an error-only callback', () => {
    expect(hasAuthPayload(`${BASE}?error=access_denied`)).toBe(false);
  });
});
