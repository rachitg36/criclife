import { Link } from 'react-router';
import { ChevronLeft, Moon, Share2, Sparkles, Tv } from 'lucide-react';
import { LivePill } from '@/components/ui/LivePill';
import { useUiStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import { useAudienceStore } from '../store';

/**
 * docs/06 § 1 — sticky header: where you are, whether the feed is healthy, and
 * the two controls a spectator actually reaches for (calm mode, share).
 */
export function AudienceHeader({
  title,
  subtitle,
  onShare,
  tvHref,
  isComplete,
}: {
  title: string;
  subtitle: string | null;
  onShare: () => void;
  tvHref: string;
  isComplete: boolean;
}) {
  const connection = useAudienceStore((s) => s.connection);
  const resume = useAudienceStore((s) => s.resume);
  const calmMode = useUiStore((s) => s.calmMode);
  const setCalmMode = useUiStore((s) => s.setCalmMode);

  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-glass-strong)] backdrop-blur-xl"
      style={{ paddingTop: 'var(--safe-t)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Link
          to="/"
          aria-label="Home"
          className="press -ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-full)] text-[var(--text-secondary)]"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[var(--text-heading-sm)] font-semibold leading-tight">
            {title}
          </h1>
          {/* Venue and build, on one line. The build id is here because a
              spectator reporting "it isn't updating" and a spectator on a
              week-old cached bundle look identical otherwise — and this app
              deliberately never auto-reloads (CLAUDE.md rule 6). */}
          <p className="truncate text-[11px] text-[var(--text-tertiary)]">
            {subtitle ? `${subtitle} · ` : ''}
            {__APP_BUILD__}
          </p>
        </div>

        {/* FINAL beats every connection state: whether the socket is up says
            nothing about a match that is already over, and "PAUSED — TAP TO
            RESUME" on a week-old game offers to resume something that cannot
            resume. */}
        {isComplete ? (
          <LivePill state="final" />
        ) : connection === 'paused' ? (
          <button
            type="button"
            onClick={resume}
            className="press rounded-[var(--r-full)] border border-[var(--border-default)] px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] text-[var(--text-secondary)]"
          >
            PAUSED — TAP TO RESUME
          </button>
        ) : (
          <LivePill state={connection} />
        )}

        <button
          type="button"
          aria-label={calmMode ? 'Turn off calm mode' : 'Turn on calm mode'}
          aria-pressed={calmMode}
          onClick={() => setCalmMode(!calmMode)}
          className={cn(
            'press grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-full)]',
            calmMode ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
          )}
        >
          {calmMode ? <Moon size={17} aria-hidden /> : <Sparkles size={17} aria-hidden />}
        </button>

        <Link
          to={tvHref}
          aria-label="Big screen mode"
          className="press hidden h-9 w-9 shrink-0 place-items-center rounded-[var(--r-full)] text-[var(--text-tertiary)] sm:grid"
        >
          <Tv size={17} aria-hidden />
        </Link>

        <button
          type="button"
          aria-label="Share this match"
          onClick={onShare}
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-full)] text-[var(--text-tertiary)]"
        >
          <Share2 size={17} aria-hidden />
        </button>
      </div>
    </header>
  );
}
