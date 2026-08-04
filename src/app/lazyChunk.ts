import { lazy, type ComponentType } from 'react';

/**
 * `lazy()`, but it survives a deploy.
 *
 * Every build gives its chunks new content-hashed names. A tab that was open
 * across a deploy still holds the *old* module graph, so the first route it
 * lazily loads afterwards asks for a filename that no longer exists on the
 * origin and dies with:
 *
 *     Failed to fetch dynamically imported module: …/AudienceRoute-nvEJNxq5.js
 *
 * Reported 2026-08-04, going to look at a finished match. Reloading fixed it,
 * which is exactly the tell: nothing was wrong with the app, only with the
 * copy of it this tab remembered.
 *
 * So: try once more, and if the retry fails the same way, reload the page —
 * the new index.html carries the new chunk names and the navigation resumes.
 * A reload is safe here in a way it is not on the scorer route: this runs
 * *before* a route's code has loaded, so there is nothing on screen to lose,
 * and unsynced balls live in IndexedDB regardless (CLAUDE.md rule 6 is about
 * not yanking the service worker out from under a scorer mid-over, not about
 * never reloading).
 *
 * The `sessionStorage` guard is what stops a genuinely missing chunk — a bad
 * deploy, a broken CDN — from becoming a reload loop.
 */
const RELOADED_KEY = 'criclife.chunkReload';

export function lazyChunk<T extends ComponentType<unknown>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load();
      // A clean load means whatever was stale has resolved; let a future
      // deploy have its one reload too.
      sessionStorage.removeItem(RELOADED_KEY);
      return mod;
    } catch (err) {
      // One retry first: a chunk can also fail on a flaky connection, and a
      // reload is a heavier answer than asking twice.
      try {
        return await load();
      } catch {
        if (sessionStorage.getItem(RELOADED_KEY)) throw err;
        sessionStorage.setItem(RELOADED_KEY, '1');
        location.reload();
        // Never resolves — the reload is already in flight, and resolving
        // with anything here would flash a wrong screen on the way out.
        return new Promise<{ default: T }>(() => {});
      }
    }
  });
}
