import { userMessage } from '@/lib/errors';

/**
 * The login screen's error text.
 *
 * This used to hold its own classification logic, written after the form put
 * the browser's raw "Failed to fetch" — and later a literal red `{}` — on
 * screen. Phase 9 generalised that into `@/lib/errors`, and this is now a
 * one-line adapter onto it: two places deciding separately what an error
 * means is exactly how the login screen drifted from the rest of the app in
 * the first place.
 *
 * Kept as a named function rather than inlining `userMessage` at the call
 * sites so the regression tests written against the original bugs still point
 * at the login flow specifically.
 */
export function humanAuthError(error: { message: string; status?: number | undefined }): string {
  return userMessage(error);
}
