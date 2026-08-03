/**
 * Reads the reason a sign-in link failed out of the callback URL.
 *
 * Supabase tells you exactly why — `error`, `error_code` and a human
 * `error_description` — and it puts them in **either** the query string
 * (PKCE) **or** the hash fragment (implicit), depending on the flow. The
 * callback screen was reading neither, so every failure produced the same
 * guess: "links expire after a while, or may only work once". Sometimes true,
 * often not, and it hid the one message that would have explained a real
 * misconfiguration.
 *
 * Third time this pattern has bitten this app — see `@/lib/errors`.
 *
 * Pure and DOM-free so it can be tested against the URLs Supabase actually
 * produces.
 */

export type CallbackError = {
  code: string | null;
  /** Ready to show. Supabase's own description where there is one. */
  message: string;
  /** Something the user can actually do next. */
  hint: string | null;
};

/** Codes worth explaining better than Supabase does. */
const HINTS: Record<string, string> = {
  otp_expired: 'Sign-in links are short-lived. Request a fresh one and use it straight away.',
  access_denied: 'The link was rejected. It may already have been used — each one works once.',
  validation_failed:
    'The link was addressed to a different site than the one you opened it in. Check the ' +
    'redirect URL configured for this project.',
  flow_state_not_found:
    'This link has to be opened in the same browser you requested it from — the second half ' +
    'of the key is stored there. Request a new one in this browser.',
  flow_state_expired:
    'The sign-in attempt this link belongs to has expired. Request a new one in this browser.',
  bad_code_verifier:
    'This link has to be opened in the same browser you requested it from. Request a new one here.',
  server_error: 'The server failed while signing you in. This is not something you can fix.',
};

function readFrom(params: URLSearchParams): CallbackError | null {
  const error = params.get('error');
  const code = params.get('error_code');
  const description = params.get('error_description');
  if (!error && !code && !description) return null;

  const key = code ?? error ?? '';
  return {
    code: key || null,
    // Supabase's descriptions arrive `+`-separated; URLSearchParams already
    // decodes those to spaces, which is why this is not doing it by hand.
    message: description?.trim() || 'That sign-in link could not be used.',
    hint: HINTS[key] ?? null,
  };
}

/**
 * `href` is passed in rather than read off `window` so this is testable and
 * so the caller decides when to look.
 */
export function parseCallbackError(href: string): CallbackError | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  // Query string first (PKCE), then the hash (implicit). The hash arrives as
  // `#error=...&error_code=...`, so the leading `#` is dropped before parsing.
  return readFrom(url.searchParams) ?? readFrom(new URLSearchParams(url.hash.replace(/^#/, '')));
}

/**
 * True when the URL carries a code or token to exchange. Used to tell "the
 * exchange failed" apart from "you opened this page with nothing in it",
 * which deserve different words.
 */
export function hasAuthPayload(href: string): boolean {
  try {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    return (
      url.searchParams.has('code') || url.searchParams.has('token_hash') || hash.has('access_token')
    );
  } catch {
    return false;
  }
}
