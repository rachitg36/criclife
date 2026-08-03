import { describe, expect, it } from 'vitest';
import { openChangeChannel } from '@/lib/realtime';

/**
 * Written after the scorer route died on
 *
 *     cannot add `postgres_changes` callbacks for
 *     realtime:scoring-grants:<matchId> after `subscribe()`.
 *
 * The fake below is not a convenience mock — it reproduces the two
 * `@supabase/realtime-js` behaviours that combine to cause that, so the test
 * fails without the fix:
 *
 *  - `channel(topic)` returns an *existing* channel with the same topic
 *    rather than making a new one (RealtimeClient.channel);
 *  - `.on('postgres_changes', …)` throws once the channel is joining or
 *    joined (RealtimeChannel.on);
 *  - and `removeChannel()` is async, so a channel torn down a moment ago is
 *    still in the client's list when the next `channel()` call looks.
 */
type FakeChannel = {
  topic: string;
  joined: boolean;
  on: (type: string) => FakeChannel;
  subscribe: () => FakeChannel;
};

function fakeHost() {
  const channels: FakeChannel[] = [];
  return {
    channels,
    channel(topic: string) {
      const existing = channels.find((c) => c.topic === topic);
      if (existing) return existing;
      const chan: FakeChannel = {
        topic,
        joined: false,
        on(type: string) {
          if (chan.joined && type === 'postgres_changes') {
            throw new Error(
              `cannot add \`${type}\` callbacks for ${chan.topic} after \`subscribe()\`.`
            );
          }
          return chan;
        },
        subscribe() {
          chan.joined = true;
          return chan;
        },
      };
      channels.push(chan);
      return chan;
    },
    /** Async, exactly like the real one — the channel lingers in the list. */
    async removeChannel(chan: FakeChannel) {
      await Promise.resolve();
      const i = channels.indexOf(chan);
      if (i >= 0) channels.splice(i, 1);
    },
  };
}

// The helper only reads `.channel`, so the fake is structurally compatible;
// the cast keeps the test honest about not having a real RealtimeChannel.
const open = (host: ReturnType<typeof fakeHost>, name: string) =>
  openChangeChannel(host as never, name) as unknown as FakeChannel;

describe('openChangeChannel', () => {
  it('never hands back a channel that is already subscribed', () => {
    const host = fakeHost();
    open(host, 'audience:m1').on('postgres_changes').subscribe();

    // The re-subscribe: same match, teardown not yet flushed. This is the
    // line that threw on the scorer route and inside the audience reconnect.
    expect(() => open(host, 'audience:m1').on('postgres_changes').subscribe()).not.toThrow();
    expect(host.channels).toHaveLength(2);
  });

  it('survives the mount → cleanup → mount that StrictMode does in dev', async () => {
    const host = fakeHost();
    const first = open(host, 'scoring-grants:m1').on('postgres_changes').subscribe();
    const teardown = host.removeChannel(first); // not awaited — cleanup is sync

    expect(() => open(host, 'scoring-grants:m1').on('postgres_changes').subscribe()).not.toThrow();
    await teardown;
  });

  it('keeps two subscribers to the same data on separate channels', () => {
    // The quiet half of the bug: a shared channel does not always throw, and
    // then whichever component unmounts first kills the other's subscription.
    const host = fakeHost();
    const guard = open(host, 'scoring-grants:m1');
    const page = open(host, 'scoring-grants:m1');
    expect(guard).not.toBe(page);
    expect(guard.topic).not.toBe(page.topic);
  });

  it('keeps the name readable and distinct per match', () => {
    const host = fakeHost();
    expect(open(host, 'audience:m1').topic).toMatch(/^audience:m1#\d+$/);
    expect(open(host, 'audience:m2').topic).toMatch(/^audience:m2#\d+$/);
  });
});
