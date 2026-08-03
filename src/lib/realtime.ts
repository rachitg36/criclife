import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Opens a Realtime channel whose topic no other subscriber can collide with.
 *
 * **The trap this exists to close.** `supabase.channel(topic)` does not always
 * create a channel — if one with that topic is already on the client it hands
 * back *that* one:
 *
 * ```js
 * const exists = this.getChannels().find((c) => c.topic === realtimeTopic)
 * if (!exists) { ...create... } else { return exists }
 * ```
 *
 * and `channel.on('postgres_changes', …)` **throws** on a channel that is
 * already joining or joined:
 *
 *     cannot add `postgres_changes` callbacks for realtime:… after `subscribe()`.
 *
 * The two combine badly because `removeChannel()` is `async` — it awaits the
 * unsubscribe round-trip to the server before dropping the channel from the
 * client's list. So a synchronous "tear down, then set up again" is never
 * synchronous on the client's side: the old channel is still in `channels`
 * when the new `channel()` call looks, the call returns the joined channel,
 * and the first `.on()` throws. Every one of these does it:
 *
 * - React StrictMode's mount → cleanup → mount in dev, on any effect that
 *   subscribes (this is what surfaced it, on the scorer route);
 * - a reconnect that tears down and re-attaches on the same topic — the
 *   audience route's dropped-connection path, where the throw would have
 *   replaced the reconnect;
 * - two components subscribing to the same data at once, which is a silently
 *   *shared* channel even when it does not throw, so whichever one unmounts
 *   first kills the other's subscription.
 *
 * A unique topic per subscriber makes all three unreachable by construction,
 * and costs nothing: channels multiplex over the one websocket the client
 * already holds, and Supabase's free tier counts concurrent connections, not
 * channels (`docs/14-FREE-TIER-PLAN.md`).
 *
 * **Only for `postgres_changes`.** There the topic is a client-side label —
 * the server routes by the filter, not the name. For `broadcast` and
 * `presence` the topic is the address two devices meet at, so it must be the
 * *same* string on both; using this there would silently stop them hearing
 * each other. `scorer-soft-lock:*` in `features/scoring/store.ts` is that
 * case, and deliberately does not use this.
 *
 * The client is passed in rather than imported so this module stays free of
 * `@supabase/supabase-js` at runtime — `RequireScoringGrant` is a static
 * import in the router and dynamically imports the client precisely to keep
 * it out of the eager chunk (CLAUDE.md rule 9).
 */

type ChannelHost = { channel(topic: string): RealtimeChannel };

let opened = 0;

export function openChangeChannel(host: ChannelHost, name: string): RealtimeChannel {
  opened += 1;
  // A per-tab counter is enough: `channel()` dedupes against this client's own
  // list, and nothing else ever reads the topic back. Counting rather than
  // randomising keeps it readable in the network inspector.
  return host.channel(`${name}#${opened}`);
}
