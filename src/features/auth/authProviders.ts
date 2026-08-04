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
  /** True only when the project reports the provider as enabled. */
  google: boolean;
};

/** Assumed when the check fails: offering nothing beats a dead end. */
const NONE: AuthProviders = { google: false };

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
    if (!res.ok) return NONE;
    return readProviders(await res.json());
  } catch {
    // Offline, blocked, or a project that does not answer. The email form is
    // unaffected and is the path that works everywhere.
    return NONE;
  }
}
