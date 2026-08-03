import { useEffect, useRef, useState } from 'react';

/**
 * docs/05-SCORER-VIEW.md § 4 — keeps the screen on while scoring, with a
 * visible indicator (the caller renders one off the returned boolean) and a
 * manual off switch (`uiStore.keepScreenAwake`, surfaced in Settings).
 *
 * The browser releases the lock the moment the tab loses visibility — that's
 * not a bug to work around, just how the API behaves — so this re-acquires
 * on `visibilitychange` rather than fighting it.
 */
export function useWakeLock(enabled: boolean): boolean {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setActive(false);
      return;
    }

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        sentinel.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false); // permission denied, battery saver, unsupported — non-fatal
      }
    }

    void acquire();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        void acquire();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
      setActive(false);
    };
  }, [enabled]);

  return active;
}
