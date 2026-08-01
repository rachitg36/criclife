import { registerSW } from 'virtual:pwa-register';

/**
 * Service worker registration.
 *
 * CRITICAL: we never auto-reload. A scorer may be mid-over, and an unsynced
 * delivery queue must not be interrupted by a page refresh. We surface a
 * prompt instead, and the caller decides when it is safe to apply.
 *
 * docs/09-ARCHITECTURE.md § 5
 */

type UpdateHandler = () => void;

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<UpdateHandler>();

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;

  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      listeners.forEach((fn) => fn());
    },
    onOfflineReady() {
      console.info('[CricLife] Ready to work offline.');
    },
  });
}

/** Subscribe to "a new version is waiting". Returns an unsubscribe function. */
export function onUpdateAvailable(fn: UpdateHandler): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Apply a waiting update. Callers MUST check that it is safe first:
 * the pad must be idle and the offline queue must be empty.
 */
export async function applyPendingUpdate(): Promise<void> {
  await applyUpdate?.(true);
}
