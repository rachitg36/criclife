import { useParams, Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PendingDelivery } from '@/lib/db';

function ballLabel(item: PendingDelivery): string {
  const { payload } = item;
  if (payload.wicket) return `WICKET (${payload.wicket.type})`;
  if (payload.extraType === 'wide')
    return payload.runsOffBat + payload.extraRuns > 1 ? 'wide+' : 'wide';
  if (payload.extraType === 'no_ball') return 'no-ball';
  if (payload.extraType === 'bye') return `${payload.extraRuns} bye`;
  if (payload.extraType === 'leg_bye') return `${payload.extraRuns} leg bye`;
  return `${payload.runsOffBat} run${payload.runsOffBat === 1 ? '' : 's'}`;
}

/**
 * docs/05-SCORER-VIEW.md § 6.5 — balls rejected because the scoring grant
 * was revoked while this device was offline. Never silently dropped: they
 * sit here until the scorer discards them, ideally after handing the
 * details to whoever currently holds scoring rights (see the Map link
 * below) so the ball gets entered by someone who's actually still allowed
 * to. There's no API to auto-transfer an unsynced ball to another user's
 * queue — Dexie is local to this device — so that hand-off is manual.
 */
export function ReviewTrayPage() {
  const { matchId } = useParams<{ matchId: string }>();

  const rejected = useLiveQuery<PendingDelivery[]>(
    () =>
      matchId
        ? db.pendingDeliveries.where('[matchId+status]').equals([matchId, 'rejected']).toArray()
        : Promise.resolve([]),
    [matchId]
  );

  async function discard(clientDeliveryId: string) {
    await db.pendingDeliveries.delete(clientDeliveryId);
  }

  async function discardAll() {
    if (!rejected) return;
    await db.pendingDeliveries.bulkDelete(rejected.map((r) => r.clientDeliveryId));
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="mb-1 text-[var(--text-heading-lg)] font-bold">Review tray</h1>
      <p className="mb-4 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        Balls this device scored offline that the server rejected — usually because scoring rights
        moved on before they synced.
      </p>

      {matchId && (
        <Link
          to={`/matches/${matchId}/rights`}
          className="mb-4 inline-block text-[13px] text-[var(--accent)] underline"
        >
          See who holds scoring rights now →
        </Link>
      )}

      {rejected === undefined && <p className="text-[var(--text-secondary)]">Loading…</p>}
      {rejected && rejected.length === 0 && (
        <div className="panel p-5 text-center text-[var(--text-secondary)]">
          Nothing here — every ball this device scored has synced.
        </div>
      )}
      {rejected && rejected.length > 0 && (
        <>
          <ul className="space-y-2">
            {rejected.map((item) => (
              <li
                key={item.clientDeliveryId}
                className="panel flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold">{ballLabel(item)}</div>
                  <div className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                  {item.lastError && (
                    <div className="truncate text-[var(--text-body-sm)] text-[var(--danger)]">
                      {item.lastError}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="press shrink-0 rounded-[var(--r-sm)] border border-[var(--border-default)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)]"
                  onClick={() => void discard(item.clientDeliveryId)}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="press mt-4 w-full rounded-[var(--r-md)] border border-[var(--border-default)] py-2.5 text-[14px] font-semibold text-[var(--text-secondary)]"
            onClick={() => void discardAll()}
          >
            Discard all
          </button>
        </>
      )}
    </div>
  );
}
