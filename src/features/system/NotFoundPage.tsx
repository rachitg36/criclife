import { Link } from 'react-router';
import { Aurora } from '@/components/ui/Aurora';

export function NotFoundPage() {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4">
      <Aurora />
      <div className="panel relative max-w-sm p-8 text-center">
        <div
          className="font-display leading-none font-extrabold tabular-nums text-[var(--accent)]"
          style={{ fontSize: 'var(--text-display-lg)' }}
        >
          404
        </div>
        <h1 className="mt-3 mb-2 text-[var(--text-heading-lg)]">Played and missed</h1>
        <p className="mb-6 text-[var(--text-secondary)]">
          That page isn&rsquo;t here. It may have been moved, or the link may be wrong.
        </p>
        <Link
          to="/"
          className="press inline-flex h-11 items-center rounded-[var(--r-md)] bg-[var(--accent)] px-5 font-medium text-[var(--accent-fg)]"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
