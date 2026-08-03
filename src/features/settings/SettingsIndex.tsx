import { Link } from 'react-router';
import { ChevronRight, Database, Info, Palette, Bell, User, Gamepad2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** `/settings` — docs/11-SCREENS-AND-ROUTES.md § 9. */
const SECTIONS: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: '/settings/profile', label: 'Your profile', hint: 'Name, photo, contact', icon: User },
  {
    to: '/settings/appearance',
    label: 'Appearance',
    hint: 'Theme, accent, calm mode',
    icon: Palette,
  },
  {
    to: '/settings/scoring',
    label: 'Scoring',
    hint: 'Handedness, haptics, wake lock',
    icon: Gamepad2,
  },
  {
    to: '/settings/notifications',
    label: 'Notifications',
    hint: 'What you hear about',
    icon: Bell,
  },
  { to: '/settings/data', label: 'Data & storage', hint: 'Export, delete account', icon: Database },
  { to: '/settings/about', label: 'About CricLife', hint: 'Version, licences', icon: Info },
];

export function SettingsIndex() {
  return (
    <div className="p-3">
      <h1 className="px-1 pb-3 text-[var(--text-heading-lg)] font-semibold">Settings</h1>
      <nav className="panel overflow-hidden rounded-[var(--r-lg)] p-0">
        <ul>
          {SECTIONS.map(({ to, label, hint, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="press flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 last:border-b-0"
              >
                <Icon size={17} aria-hidden className="shrink-0 text-[var(--text-tertiary)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[var(--text-body)] font-medium">{label}</span>
                  <span className="block text-[11px] text-[var(--text-tertiary)]">{hint}</span>
                </span>
                <ChevronRight
                  size={16}
                  aria-hidden
                  className="shrink-0 text-[var(--text-tertiary)]"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
