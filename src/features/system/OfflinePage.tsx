import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { pendingCount } from '@/lib/db';

/**
 * Service worker navigation fallback. The message here matters: a scorer who
 * loses signal must be told immediately that nothing they entered is lost.
 * docs/05-SCORER-VIEW.md § 6
 */
export function OfflinePage() {
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    void pendingCount().then(setPending);
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="panel max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--warning)]/15">
          <CloudOff size={22} className="text-[var(--warning)]" aria-hidden />
        </div>
        <h1 className="mb-2 text-[var(--text-heading-lg)]">You&rsquo;re offline</h1>
        <p className="text-[var(--text-secondary)]">
          {pending && pending > 0 ? (
            <>
              <strong className="text-[var(--text-primary)]">{pending}</strong> unsynced{' '}
              {pending === 1 ? 'ball is' : 'balls are'} saved on this device and will upload
              automatically when you reconnect.
            </>
          ) : (
            <>Nothing is waiting to sync. Reconnect to load fresh data.</>
          )}
        </p>
      </div>
    </div>
  );
}
