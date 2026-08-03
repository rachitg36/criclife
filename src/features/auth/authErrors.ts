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
/**
 * Some GoTrue failures come back with a body that carries no usable text at
 * all — an empty object, an empty string. Passing that straight through put a
 * literal `{}` on the login screen, in red, as the only explanation a user
 * got. Anything that conveys nothing is replaced with something that at least
 * says what to do and carries the status code for a bug report.
 */
function isUninformative(message: string): boolean {
  const trimmed = message.trim();
  return (
    trimmed === '' ||
    trimmed === '{}' ||
    trimmed === '[]' ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === '[object Object]'
  );
}

export function humanAuthError(error: { message: string; status?: number | undefined }): string {
  // Deliberately NOT "status is undefined". supabase-js reports a genuine
  // network failure as status 0 with one of the browser wordings below, so
  // those two signals are enough — and treating a missing status as a network
  // error swallowed real server messages like "Email rate limit exceeded",
  // which the existing LoginPage test caught immediately.
  const looksLikeNetwork =
    error.status === 0 ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);

  if (!looksLikeNetwork) {
    if (!isUninformative(error.message)) return error.message;
    // Most often a mail-sending failure on the server side: the request was
    // accepted, GoTrue tried to send, and SMTP refused. The user can do
    // nothing about it, so say so plainly and keep the status for us.
    const code = error.status === undefined ? '' : ` (error ${error.status})`;
    return `Sign-in is failing on the server${code}. This is not something you can fix — try again shortly.`;
  }

  return typeof navigator !== 'undefined' && !navigator.onLine
    ? "You're offline. Sign-in needs a connection — try again once you have signal."
    : "Couldn't reach the server. Check your connection and try again.";
}
