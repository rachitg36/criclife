import { NavLink, Outlet } from 'react-router';
import { motion } from 'motion/react';
import { Home, Shield, PlusCircle, TrendingUp, Menu } from 'lucide-react';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';

type Tab = {
  to: string;
  label: string;
  Icon: typeof Home;
  end: boolean;
  /** The raised centre button — starting a match is always the primary action. */
  primary: boolean;
};

const TABS: readonly Tab[] = [
  { to: '/', label: 'Home', Icon: Home, end: true, primary: false },
  { to: '/teams', label: 'Teams', Icon: Shield, end: false, primary: false },
  { to: '/matches/new', label: 'Match', Icon: PlusCircle, end: false, primary: true },
  { to: '/ranks', label: 'Ranks', Icon: TrendingUp, end: false, primary: false },
  { to: '/settings', label: 'More', Icon: Menu, end: false, primary: false },
];

/** Authenticated shell with the 5-item bottom tab bar. docs/11 § Navigation. */
export function AppLayout() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--bg-base)]">
      <main
        className="mx-auto w-full flex-1"
        style={{
          maxWidth: 'var(--content-max)',
          paddingBottom: 'calc(var(--tabbar-h) + var(--safe-b) + 16px)',
        }}
      >
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)]"
        style={{
          background: 'var(--surface-glass-strong)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          paddingBottom: 'var(--safe-b)',
        }}
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {TABS.map(({ to, label, Icon, end, primary }) => {
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => haptic('select')}
                  className="group relative flex h-[var(--tabbar-h)] flex-col items-center justify-center gap-0.5"
                >
                  {({ isActive }) => (
                    <>
                      {isActive && !primary && (
                        <motion.span
                          layoutId="tab-indicator"
                          className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--accent)]"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}
                      <Icon
                        size={primary ? 28 : 21}
                        strokeWidth={isActive ? 2.2 : 1.75}
                        className={cn(
                          'transition-colors',
                          primary
                            ? 'text-[var(--accent)]'
                            : isActive
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-tertiary)]'
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          'text-[10px] font-medium transition-colors',
                          isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'
                        )}
                      >
                        {label}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
