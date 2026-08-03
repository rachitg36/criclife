import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScorerStore } from '@/features/scoring/store';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

/**
 * "I click the button to start the innings, but nothing happens."
 *
 * That is the only outcome that tells nobody anything, and this function had
 * three ways to produce it: a bare `return` when no match was loaded, a throw
 * inside the `init()` that follows a successful call — rejecting a promise the
 * button fires and forgets, so it reached the console and nowhere else — and a
 * success that leaves the mode unchanged.
 *
 * Every path now ends in either a visible state change or a sentence.
 */
const rpc = vi.mocked(supabase.rpc);

describe('startNextInnings', () => {
  beforeEach(() => {
    rpc.mockReset();
    useScorerStore.setState({
      matchId: 'match-1',
      mode: 'NOT_STARTED',
      error: null,
      starting: false,
    });
  });

  it('says so when there is no match, instead of returning silently', async () => {
    useScorerStore.setState({ matchId: null });
    await useScorerStore.getState().startNextInnings();

    expect(rpc).not.toHaveBeenCalled();
    expect(useScorerStore.getState().error).toMatch(/no match is loaded/i);
  });

  it('translates the server refusals rather than showing their raw text', async () => {
    rpc.mockResolvedValue({
      error: { message: 'XI_REQUIRED: set the playing XI for both teams before starting' },
    } as never);

    await useScorerStore.getState().startNextInnings();

    const { error } = useScorerStore.getState();
    expect(error).toMatch(/squad/i);
    expect(error).not.toMatch(/XI_REQUIRED/);
  });

  it('reports a throw from the reload that follows a successful start', async () => {
    rpc.mockResolvedValue({ error: null } as never);
    const init = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    useScorerStore.setState({ init });

    await useScorerStore.getState().startNextInnings();

    expect(useScorerStore.getState().error).toMatch(/connection/i);
  });

  it('does not sit silently when the call succeeds but no innings appears', async () => {
    rpc.mockResolvedValue({ error: null } as never);
    // init resolves, but the mode is still NOT_STARTED — nothing known causes
    // this, which is exactly why it must not look like a dead button.
    useScorerStore.setState({ init: vi.fn().mockResolvedValue(undefined) });

    await useScorerStore.getState().startNextInnings();

    expect(useScorerStore.getState().error).toMatch(/did not come back/i);
  });

  it('stays quiet when it works', async () => {
    rpc.mockResolvedValue({ error: null } as never);
    useScorerStore.setState({
      init: vi.fn().mockImplementation(async () => {
        useScorerStore.setState({ mode: 'AWAITING_OPENERS' });
      }),
    });

    await useScorerStore.getState().startNextInnings();

    expect(useScorerStore.getState().error).toBeNull();
    expect(useScorerStore.getState().mode).toBe('AWAITING_OPENERS');
  });

  it('clears the in-flight flag whichever way it ends', async () => {
    rpc.mockRejectedValue(new Error('boom'));
    await useScorerStore.getState().startNextInnings();
    expect(useScorerStore.getState().starting).toBe(false);
  });
});
