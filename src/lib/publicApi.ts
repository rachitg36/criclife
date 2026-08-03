import { env } from './env';

/**
 * A deliberately tiny PostgREST read client for the **public** audience route.
 *
 * Why not just use `@/lib/supabase`? Because `@supabase/supabase-js` is 216 kB
 * raw / ~57 kB gzipped, and importing it from `AudienceRoute` puts all of it
 * on the critical path of the one route with a hard performance bar:
 * docs/06 § 8 wants "LCP < 1.8s on 4G" and "initial JS < 180 kB" for
 * `/live/:publicSlug`, and the route was already at 174 kB before Phase 7
 * added a line. Measured, not assumed — see HANDOFF.md § 6.4.
 *
 * The initial page load is plain authenticated-by-anon-key HTTP: three GETs
 * against PostgREST, which is all `supabase-js` would have done anyway. The
 * real client is then imported *dynamically*, after first paint, purely for
 * the Realtime websocket — nothing a spectator sees on load waits for it.
 *
 * Reads only. There is no write path here on purpose: everything this file
 * can reach is covered by a `using (true)` select policy (docs/03 § 6,
 * "anonymous audience access"), and it holds no session, so it could not
 * write even if asked to.
 */

const REST = `${env.VITE_SUPABASE_URL}/rest/v1`;

/** PostgREST caps a response at 1000 rows; page under that and loop. */
const PAGE_SIZE = 500;

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
    ...extra,
  };
}

export class PublicApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PublicApiError';
    this.status = status;
  }
}

async function get<T>(query: string, signal?: AbortSignal, range?: string): Promise<T[]> {
  const res = await fetch(`${REST}/${query}`, {
    headers: headers(range ? { Range: range } : undefined),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PublicApiError(body || `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T[];
}

/** A single row, or `null` when nothing matched — not an error. */
export async function selectOne<T>(query: string, signal?: AbortSignal): Promise<T | null> {
  const rows = await get<T>(`${query}&limit=1`, signal);
  return rows[0] ?? null;
}

export async function selectMany<T>(query: string, signal?: AbortSignal): Promise<T[]> {
  return get<T>(query, signal);
}

/**
 * Walks every page of a query. `query` must already carry its own `order=`,
 * or the pages are not guaranteed to be disjoint.
 */
export async function selectAll<T>(query: string, signal?: AbortSignal): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await get<T>(query, signal, `${from}-${from + PAGE_SIZE - 1}`);
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}
