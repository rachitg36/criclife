import { Outlet, ScrollRestoration } from 'react-router';
import { Suspense } from 'react';
import { SkeletonText } from '@/components/ui/Skeleton';
import { UpdatePrompt } from '@/components/system/UpdatePrompt';

/**
 * docs/12 Phase 9's a11y pass starts here: a keyboard user landing on any
 * screen can jump straight past the header and tab bar to the content. The
 * link is invisible until focused, which is the whole convention.
 *
 * `#main` is provided by each layout rather than by this one, because the
 * scorer's shell and the audience's shell have genuinely different roots.
 */
export function RootLayout() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Suspense
        fallback={
          <div className="p-6">
            <SkeletonText lines={5} />
          </div>
        }
      >
        <Outlet />
      </Suspense>
      <ScrollRestoration />
      <UpdatePrompt />
    </>
  );
}
