/**
 * Which sign-in providers this Supabase project actually has switched on.
 *
 * `signInWithOAuth` does not call an API — it navigates the browser straight
 * to GoTrue's `/authorize`. So when a provider is not enabled, there is no
 * error object to catch and translate: the browser simply lands on
 *
 *     {"code":400,"error_code":"validation_failed",
 *      "msg":"Unsupported provider: provider is not enabled"}
 *
 * as raw JSON, outside the app entirely. Nothing client-side can rescue that
 * after the fact, which leaves one honest option — don't offer the button
 * until the project can honour it.
 *
 * `/auth/v1/settings` is GoTrue's own public description of itself and reports
 * exactly this. Plain `fetch`, so the login route does not pull anything new.
 */

export type AuthProviders = {
  /** True when the project reports the provider as enabled — or when the
      probe could not reach a verdict. See `UNKNOWN`. */
  google: boolean;
  /** The answer above is a guess, not the project's word. Lets the login page
      say so rather than presenting it as fact. */
  probeFailed?: boolean;
};

/**
 * What to assume when the check itself fails.
 *
 * This used to be `{ google: false }` — "offering nothing beats a dead end" —
 * and that reasoning is wrong in one important way: **a failed probe is not
 * evidence the provider is off.** A blocked request, an offline moment, a
 * changed response shape and a genuinely disabled provider all produced the
 * same silently missing button. Google was enabled on both projects and the
 * button was gone, with nothing on screen to say why.
 *
 * So an *inconclusive* probe now shows the button. The downside is a dead end
 * if the provider really is off; the downside of the old behaviour was a
 * working sign-in method being invisible with no way to find out. The second
 * is worse, and only the first is recoverable by tapping back.
 */
const UNKNOWN: AuthProviders = { google: true, probeFailed: true };

type SettingsResponse = { external?: Record<string, unknown> };

export function readProviders(body: unknown): AuthProviders {
  const external = (body as SettingsResponse | null)?.external;
  return { google: external?.google === true };
}

export async function fetchAuthProviders(
  supabaseUrl: string,
  anonKey: string,
  signal?: AbortSignal
): Promise<AuthProviders> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return UNKNOWN;
    return readProviders(await res.json());
  } catch {
    // Offline, blocked, or a project that does not answer. The email form is
    // unaffected and is the path that works everywhere.
    return UNKNOWN;
  }
}
