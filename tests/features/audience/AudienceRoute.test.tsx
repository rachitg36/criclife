import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AudienceRoute from '@/features/audience/AudienceRoute';
import { useAudienceStore } from '@/features/audience/store';

/**
 * The load → replay → render path for `/live/:publicSlug`, end to end through
 * the real store and the real engine, with only the network faked.
 *
 * `@/lib/supabase` is mocked to a channel stub because the store imports it
 * *dynamically*, after first paint, purely for the Realtime socket — the whole
 * point being that nothing rendered here waits on it. That is asserted below.
 */
const removeChannel = vi.fn();
const supabaseImport = vi.fn();

vi.mock('@/lib/supabase', () => {
  const channel = {
    on: vi.fn(function (this: unknown) {
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      cb('SUBSCRIBED');
      return channel;
    }),
  };
  supabaseImport();
  return { supabase: { channel: () => channel, removeChannel } };
});

const TEAM_A = {
  id: 'team-a',
  name: 'Mumbai',
  short_code: 'MUM',
  primary_color: '#123456',
  secondary_color: null,
  logo_url: null,
};
const TEAM_B = { ...TEAM_A, id: 'team-b', name: 'Chennai', short_code: 'CHE' };

const MATCH_ROW = {
  id: 'match-1',
  public_slug: 'mum-vs-che-8f3a',
  title: 'MUM vs CHE',
  venue: 'Wankhede',
  status: 'live',
  is_locked: false,
  config: {
    oversPerInnings: 20,
    ballsPerOver: 6,
    playersPerSide: 11,
    maxOversPerBowler: 'auto',
    wideRuns: 1,
    noBallRuns: 1,
    byesEnabled: true,
    legByesEnabled: true,
    freeHitAfterNoBall: true,
    noBallFreeHitOnAllNoBalls: false,
    lastManStanding: false,
    powerplays: [],
    superOverOnTie: true,
    retiredHurtCanReturn: true,
    penaltyRunsEnabled: true,
    declarationsEnabled: false,
    followOnEnabled: false,
    drsEnabled: false,
  },
  scheduled_at: null,
  team_a_id: 'team-a',
  team_b_id: 'team-b',
  team_a: TEAM_A,
  team_b: TEAM_B,
  innings: [
    {
      id: 'innings-1',
      innings_no: 1,
      batting_team_id: 'team-a',
      bowling_team_id: 'team-b',
      is_super_over: false,
      status: 'in_progress',
      target: null,
      revised_target: null,
      revised_overs: null,
    },
  ],
};

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    innings_id: 'innings-1',
    match_id: 'match-1',
    seq: 1,
    over_no: 0,
    ball_in_over: 1,
    is_legal: true,
    striker_id: 'p1',
    non_striker_id: 'p2',
    bowler_id: 'p3',
    runs_batter: 4,
    runs_extras: 0,
    extra_type: null,
    runs_total: 4,
    is_wicket: false,
    wicket_type: null,
    dismissed_player_id: null,
    fielder_id: null,
    assist_fielder_id: null,
    crossed_before_dismissal: null,
    is_free_hit: false,
    creates_free_hit: false,
    is_boundary_four: true,
    is_boundary_six: false,
    shot_x: null,
    shot_y: null,
    pitch_x: null,
    pitch_y: null,
    commentary: 'p3 to p1, FOUR! finds the gap',
    client_delivery_id: 'cid-1',
    is_deleted: false,
    ...overrides,
  };
}

const squadRow = (id: string, teamId: string, name: string, order: number) => ({
  team_id: teamId,
  is_captain: order === 1,
  is_wicket_keeper: false,
  batting_order: order,
  player: {
    id,
    full_name: name,
    short_name: null,
    photo_url: null,
    primary_role: 'batter',
    batting_hand: 'right',
    bowling_style: null,
  },
});

function mockFetch(deliveries = [deliveryRow()], match: unknown = MATCH_ROW) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/matches?')
      ? match === null
        ? []
        : [match]
      : url.includes('/match_squads?')
        ? [
            squadRow('p1', 'team-a', 'Rohit Sharma', 1),
            squadRow('p2', 'team-a', 'Axar Patel', 2),
            squadRow('p3', 'team-b', 'Jasprit Bumrah', 1),
          ]
        : url.includes('/deliveries?')
          ? deliveries
          : [];
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
}

function renderRoute(path = '/live/mum-vs-che-8f3a') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/live/:publicSlug" element={<AudienceRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAudienceStore.getState().teardown();
  useAudienceStore.setState({
    status: 'idle',
    match: null,
    innings: [],
    players: [],
    deliveries: [],
    matchState: null,
    tab: 'live',
    momentQueue: [],
    missedBalls: null,
    scrubTo: null,
    error: null,
  });
  removeChannel.mockClear();
});

afterEach(() => {
  useAudienceStore.getState().teardown();
  vi.unstubAllGlobals();
});

describe('AudienceRoute — the public live scoreboard', () => {
  it('renders the score from the delivery log, not from a stored total', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderRoute();

    // 4 runs for 0 — projected by replaying one boundary through the engine.
    await screen.findByText('MUM');
    const hero = await screen.findByLabelText('4');
    expect(hero).toBeInTheDocument();
    expect(screen.getByText('0.1 / 20 overs')).toBeInTheDocument();
  });

  it('resolves player ids to names in the ball-by-ball feed', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderRoute();
    expect(await screen.findByText(/J Bumrah to R Sharma, FOUR!/)).toBeInTheDocument();
  });

  it('says so plainly when the slug matches no match', async () => {
    vi.stubGlobal('fetch', mockFetch([], null));
    renderRoute();
    expect(await screen.findByText('No such match')).toBeInTheDocument();
  });

  it('queues no moments for balls that were already in the first load', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderRoute();
    await screen.findByText('MUM');
    // The boundary above is history, not something that just happened — a
    // spectator opening the link ten overs late must not see ten celebrations.
    expect(useAudienceStore.getState().momentQueue).toEqual([]);
  });

  it('switches to the scorecard tab', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderRoute();
    await screen.findByText('MUM');

    await userEvent.click(screen.getByRole('tab', { name: 'Scorecard' }));
    await waitFor(() => expect(screen.getByText('Extras')).toBeInTheDocument());
    expect(screen.getByText('Mumbai')).toBeInTheDocument();
  });

  it('labels the win-probability bar as an estimate, never as fact', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderRoute();
    await screen.findByText('MUM');
    expect(screen.getByText('estimate')).toBeInTheDocument();
    // First innings: a par comparison, not a win probability.
    expect(screen.getByText('Par comparison')).toBeInTheDocument();
  });

  it('renders the TV layout for ?tv=1', async () => {
    vi.stubGlobal('fetch', mockFetch());
    renderRoute('/live/mum-vs-che-8f3a?tv=1');
    await waitFor(() => expect(screen.getByText('AT THE CREASE')).toBeInTheDocument());
    // No app chrome in kiosk mode.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('tears the Realtime channel down when the route unmounts', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const { unmount } = renderRoute();
    await screen.findByText('MUM');
    await waitFor(() => expect(useAudienceStore.getState().connection).toBe('live'));
    unmount();
    expect(removeChannel).toHaveBeenCalled();
  });
});
