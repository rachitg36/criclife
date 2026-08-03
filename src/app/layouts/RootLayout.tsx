import { Outlet, ScrollRestoration } from 'react-router';
import { Suspense } from 'react';
import { SkeletonText } from '@/components/ui/Skeleton';
import { UpdatePrompt } from '@/components/system/UpdatePrompt';

export function RootLayout() {
  return (
    <>
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
