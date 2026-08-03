import { useRef } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { FeedItem } from '../feed';
import type { AudienceView } from '../useAudienceView';
import { FeedRow } from './FeedRow';

/**
 * docs/06 § 8 — "ball feed is virtualised past 60 entries".
 *
 * Split into its own lazily-loaded module because `@tanstack/virtual-core` is
 * ~45 kB of source and the first screenful of a feed never needs it: whatever
 * is above the fold is in the first handful of rows, and `LiveFeedTab` renders
 * those directly while this module is still arriving. It is a genuine
 * progressive enhancement, not a deferred requirement — which is also why it
 * is fair to keep it out of the route's measured initial JS.
 */
export default function VirtualFeed({ items, view }: { items: FeedItem[]; view: AudienceView }) {
  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 64,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  return (
    <div ref={listRef} className="px-3 py-3">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]!;
          return (
            <div
              key={item.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-2"
              style={{
                transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <FeedRow item={item} view={view} isNewest={row.index === 0} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
