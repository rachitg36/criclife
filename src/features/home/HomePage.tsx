import { Link } from 'react-router';
import { motion } from 'motion/react';
import { PlusCircle, Shield, TrendingUp, Radio } from 'lucide-react';
import { Aurora } from '@/components/ui/Aurora';
import { CountUp } from '@/components/ui/CountUp';
import { LivePill } from '@/components/ui/LivePill';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/**
 * Phase 0 home. The hero is real (aurora, count-up, tabular numerals, theme
 * toggle) so the visual language can be judged before features exist. The
 * cards below are the Phase 1+ entry points.
 * docs/11-SCREENS-AND-ROUTES.md § 2
 */
export function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <Aurora />

      <header className="relative flex items-center justify-between px-4 pt-4">
        <span className="font-display text-[17px] font-bold tracking-tight">CricLife</span>
        <ThemeToggle compact />
      </header>

      <section className="relative px-4 pt-8 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="panel p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="label-overline">Phase 0 · Foundations</span>
            <LivePill state="paused" />
          </div>

          <div
            className="font-display leading-none font-extrabold tabular-nums"
            style={{ fontSize: 'var(--text-display-xl)' }}
          >
            <CountUp value={0} />
            <span className="text-[var(--text-tertiary)]">–</span>
            <CountUp value={0} />
          </div>

          <p className="mt-2 text-[var(--text-secondary)]">
            No matches yet. The scaffold is live — theme, tokens, routes and the no-scroll scoring
            shell are all in place.
          </p>
        </motion.div>
      </section>

      {/* grid-cols-1 (not bare `grid`): an implicit auto track sizes to
          max-content, and `truncate` makes that the full unwrapped subtitle —
          which blew the cards past the viewport. minmax(0,1fr) clamps it. */}
      <section className="relative grid grid-cols-1 gap-3 px-4 pb-8">
        <QuickLink
          to="/matches/new"
          Icon={PlusCircle}
          title="Start a match"
          subtitle="Pick teams, set the overs, choose who scores"
          phase={4}
        />
        <QuickLink
          to="/teams/new"
          Icon={Shield}
          title="Create a team"
          subtitle="Add players, set colours, invite your squad"
          phase={3}
        />
        <QuickLink
          to="/ranks"
          Icon={TrendingUp}
          title="Rankings"
          subtitle="All players, all teams — filter as you like"
          phase={8}
        />
        <QuickLink
          to="/settings/appearance"
          Icon={Radio}
          title="Appearance"
          subtitle="Dark, light and accent colours — working now"
          phase={0}
        />
      </section>
    </div>
  );
}

function QuickLink({
  to,
  Icon,
  title,
  subtitle,
  phase,
}: {
  to: string;
  Icon: typeof Shield;
  title: string;
  subtitle: string;
  phase: number;
}) {
  return (
    <Link to={to} className="panel press flex items-center gap-4 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent-muted)]">
        <Icon size={20} className="text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{title}</div>
        <div className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          {subtitle}
        </div>
      </div>
      {phase > 0 && (
        <span className="label-overline shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-1">
          P{phase}
        </span>
      )}
    </Link>
  );
}
