import { Suspense, lazy, useMemo } from 'react';
import { buildFeed, type FeedItem } from '../feed';
import type { AudienceView } from '../useAudienceView';
import { useAudienceStore } from '../store';
import { FeedRow } from './FeedRow';

/**
 * docs/06 § 2 "Live" — ball-by-ball, newest first, spring entry, over dividers.
 *
 * Virtualised past 60 entries per docs/06 § 8. Below that the plain list is
 * both faster and simpler. Above it, the virtualiser arrives as a lazy chunk
 * and the plain list of the first 60 stands in meanwhile — those are the only
 * rows that can be on screen anyway, so nothing a reader sees is waiting on it.
 */
const VIRTUALISE_ABOVE = 60;

const VirtualFeed = lazy(() => import('./VirtualFeed'));

export function LiveFeedTab({ view }: { view: AudienceView }) {
  const deliveries = useAudienceStore((s) => s.deliveries);
  const scrubTo = useAudienceStore((s) => s.scrubTo);
  const match = useAudienceStore((s) => s.match);
  const inningsRows = useAudienceStore((s) => s.innings);

  const items = useMemo(() => {
    if (!match) return [];
    const visible = scrubTo === null ? deliveries : deliveries.slice(0, scrubTo);
    const battingTeamByInnings = new Map(
      inningsRows.map((i) => [i.inningsNo, i.battingTeamId] as const)
    );
    return buildFeed({
      deliveries: visible,
      config: match.config,
      nameOf: view.nameOf,
      teamCodeOf: (teamId) => view.teamById.get(teamId)?.shortCode ?? '—',
      battingTeamOf: (inningsNo) => battingTeamByInnings.get(inningsNo) ?? null,
    });
  }, [deliveries, scrubTo, match, inningsRows, view.nameOf, view.teamById]);

  if (items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
        No balls bowled yet. The feed fills in as the match starts.
      </p>
    );
  }

  if (items.length <= VIRTUALISE_ABOVE) return <PlainFeed items={items} view={view} />;

  return (
    <Suspense fallback={<PlainFeed items={items.slice(0, VIRTUALISE_ABOVE)} view={view} />}>
      <VirtualFeed items={items} view={view} />
    </Suspense>
  );
}

function PlainFeed({ items, view }: { items: FeedItem[]; view: AudienceView }) {
  return (
    <ol className="flex flex-col gap-2 px-3 py-3">
      {items.map((item, index) => (
        <li key={item.key}>
          <FeedRow item={item} view={view} isNewest={index === 0} />
        </li>
      ))}
    </ol>
  );
}
