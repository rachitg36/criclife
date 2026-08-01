import { isRouteErrorResponse, useRouteError, Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';

export function ErrorPage() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred.';

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="panel max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger)]/15">
          <AlertTriangle size={22} className="text-[var(--danger)]" aria-hidden />
        </div>
        <h1 className="mb-2 text-[var(--text-heading-lg)]">Something went wrong</h1>
        <p className="mb-4 text-[var(--text-secondary)]">{message}</p>
        <p className="mb-6 text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
          Any unsynced scoring on this device is safe — it&rsquo;s stored locally and will upload
          when you reload.
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="press h-11 rounded-[var(--r-md)] bg-[var(--accent)] px-5 font-medium text-[var(--accent-fg)]"
          >
            Reload
          </button>
          <Link
            to="/"
            className="press inline-flex h-11 items-center rounded-[var(--r-md)] border border-[var(--border-default)] px-5"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
