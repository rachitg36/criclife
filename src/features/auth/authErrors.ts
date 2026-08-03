/**
 * Supabase surfaces a lost connection as the browser's own `Failed to fetch`,
 * which tells a cricketer at a ground with two bars of signal nothing at all.
 * Found by actually running the login form against an unreachable project —
 * "Failed to fetch" was what the screen said.
 *
 * Genuine auth errors ("Email rate limit exceeded", "Invalid login
 * credentials") are already written for humans and pass through untouched.
 * This only rewrites the ones that aren't.
 */
export function humanAuthError(error: { message: string; status?: number | undefined }): string {
  // Deliberately NOT "status is undefined". supabase-js reports a genuine
  // network failure as status 0 with one of the browser wordings below, so
  // those two signals are enough — and treating a missing status as a network
  // error swallowed real server messages like "Email rate limit exceeded",
  // which the existing LoginPage test caught immediately.
  const looksLikeNetwork =
    error.status === 0 ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);

  if (!looksLikeNetwork) return error.message;

  return typeof navigator !== 'undefined' && !navigator.onLine
    ? "You're offline. Sign-in needs a connection — try again once you have signal."
    : "Couldn't reach the server. Check your connection and try again.";
}
