import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { ReviewTrayPage } from '@/features/matches/ReviewTrayPage';

const MATCH_ID = 'match-1';
const OTHER_MATCH_ID = 'match-2';

function renderPage(matchId = MATCH_ID) {
  return render(
    <MemoryRouter initialEntries={[`/matches/${matchId}/review`]}>
      <Routes>
        <Route path="/matches/:matchId/review" element={<ReviewTrayPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function rejectedRow(clientDeliveryId: string, matchId = MATCH_ID) {
  return {
    clientDeliveryId,
    matchId,
    inningsId: 'innings-1',
    payload: {
      clientDeliveryId,
      runsOffBat: 1,
      extraType: null,
      extraRuns: 0,
      isBoundary: false,
      wicket: null,
      strikerId: 's1',
      nonStrikerId: 'ns1',
      bowlerId: 'b1',
    },
    expectedSeq: 5,
    createdAt: Date.now(),
    status: 'rejected' as const,
    attempts: 1,
    lastError: 'NO_GRANT: you do not hold an active scoring grant',
  };
}

describe('ReviewTrayPage — docs/05 § 6.5', () => {
  beforeEach(async () => {
    await db.pendingDeliveries.clear();
  });

  afterEach(async () => {
    await db.pendingDeliveries.clear();
  });

  it('shows the empty state when nothing was rejected', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Nothing here/)).toBeInTheDocument();
    });
  });

  it('lists only this match\'s rejected balls, not another match\'s', async () => {
    await db.pendingDeliveries.bulkAdd([
      rejectedRow('a', MATCH_ID),
      rejectedRow('b', OTHER_MATCH_ID),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('1 run')).toBeInTheDocument();
    });
    expect(screen.getAllByText('1 run')).toHaveLength(1);
    expect(screen.getByText(/NO_GRANT/)).toBeInTheDocument();
  });

  it('Discard removes a single rejected ball', async () => {
    const user = userEvent.setup();
    await db.pendingDeliveries.add(rejectedRow('a'));

    renderPage();

    await waitFor(() => expect(screen.getByText('1 run')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(async () => {
      expect(await db.pendingDeliveries.get('a')).toBeUndefined();
    });
    expect(await screen.findByText(/Nothing here/)).toBeInTheDocument();
  });

  it('Discard all clears every rejected ball for the match', async () => {
    const user = userEvent.setup();
    await db.pendingDeliveries.bulkAdd([rejectedRow('a'), rejectedRow('b')]);

    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard all' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Discard all' }));

    await waitFor(async () => {
      expect(await db.pendingDeliveries.count()).toBe(0);
    });
  });

  it('links to the Scoring Rights Map so the scorer knows who to hand off to', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /scoring rights now/ })).toHaveAttribute(
        'href',
        `/matches/${MATCH_ID}/rights`
      );
    });
  });
});
