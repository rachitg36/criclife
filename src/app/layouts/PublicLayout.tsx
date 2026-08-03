import { Outlet } from 'react-router';

/** Audience shell — public, no auth, no tab bar. docs/06-AUDIENCE-VIEW.md */
export function PublicLayout() {
  return (
    <div className="min-h-[100dvh] bg-[var(--bg-base)]">
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full"
        style={{ maxWidth: 'var(--content-max)' }}
      >
        <Outlet />
      </main>
    </div>
  );
}
