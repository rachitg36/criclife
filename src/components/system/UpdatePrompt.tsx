import { useEffect, useState } from 'react';
import { onUpdateAvailable, applyPendingUpdate } from '@/lib/sw';

/**
 * docs/09-ARCHITECTURE.md § 5 — "Updates are blocked entirely while
 * padState !== 'READY' or the queue is non-empty." A scorer's unsynced
 * balls live in Dexie regardless of which match or route is active, so
 * this checks the queue globally rather than reaching into the scoring
 * store — and only pulls in Dexie once an update is actually waiting
 * (rare), keeping this component's own footprint out of the eager bundle
 * it's mounted in (`RootLayout`, present on every route).
 */
export function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [safeToReload, setSafeToReload] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => onUpdateAvailable(() => setUpdateAvailable(true)), []);

  useEffect(() => {
    if (!updateAvailable) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      const { pendingCount } = await import('@/lib/db');
      const check = async () => {
        const n = await pendingCount();
        if (!cancelled) setSafeToReload(n === 0);
      };
      await check();
      interval = setInterval(() => void check(), 3000);
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [updateAvailable]);

  if (!updateAvailable || !safeToReload) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(var(--sp-4)+var(--safe-b))] z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-[var(--r-md)] bg-[var(--surface-glass-strong)] px-4 py-3 text-[13px] shadow-[var(--glow-md)] backdrop-blur-xl"
    >
      <span className="text-[var(--text-primary)]">New version available</span>
      <button
        type="button"
        disabled={applying}
        className="press shrink-0 rounded-[var(--r-sm)] bg-[var(--accent)] px-3 py-1.5 font-semibold text-[var(--accent-fg)] disabled:opacity-60"
        onClick={() => {
          setApplying(true);
          void applyPendingUpdate();
        }}
      >
        {applying ? 'Reloading…' : 'Reload'}
      </button>
    </div>
  );
}
