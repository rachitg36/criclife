import { Suspense, lazy, useCallback, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { env } from '@/lib/env';
import { useAudienceStore } from './store';
import { useAudienceView } from './useAudienceView';
import { AudienceHeader } from './components/AudienceHeader';
import { MatchNarrative } from './components/MatchNarrative';
import { AudienceTabs } from './components/AudienceTabs';
import { BattersPanel } from './components/BattersPanel';
import { CatchUpCard } from './components/CatchUpCard';
import { Hero } from './components/Hero';
import { LiveFeedTab } from './components/LiveFeedTab';
import { MomentOverlay } from './components/MomentOverlay';
import { ReplayScrubber } from './components/ReplayScrubber';
import { ThisOverStrip } from './components/ThisOverStrip';
import { WinProbabilityBar } from './components/WinProbabilityBar';

/**
 * `/live/:publicSlug` — public, unauthenticated. docs/06-AUDIENCE-VIEW.md.
 *
 * Unlike the scorer view, **scrolling is welcome here**: this is a browsing
 * experience, and the no-scroll rule (CLAUDE.md rule 2) is specifically about
 * `ScoringLayout`. What the hero owes the reader instead is that the score,
 * the target and the chase all fit in the first screenful.
 */

/**
 * docs/06 § 8 — "charts are lazy-loaded per tab, not in the initial bundle".
 * This boundary is the only reason `src/components/viz/*` stays out of the
 * audience route's measured initial JS.
 */
const ChartsTab = lazy(() => import('./components/ChartsTab'));

/**
 * The same argument applies to every panel that isn't on screen when the page
 * first paints. `Live` is the default tab, and `?tv=1` is a deliberate opt-in
 * from a laptop, so none of these three belong in the initial download either.
 */
const ScorecardTab = lazy(() =>
  import('./components/ScorecardTab').then((m) => ({ default: m.ScorecardTab }))
);
const SquadsTab = lazy(() =>
  import('./components/SquadsTab').then((m) => ({ default: m.SquadsTab }))
);
const TvLayout = lazy(() => import('./components/TvLayout').then((m) => ({ default: m.TvLayout })));

export default function AudienceRoute() {
  const { publicSlug } = useParams();
  const [searchParams] = useSearchParams();
  const tvMode = searchParams.get('tv') === '1';

  const load = useAudienceStore((s) => s.load);
  const teardown = useAudienceStore((s) => s.teardown);
  const status = useAudienceStore((s) => s.status);
  const error = useAudienceStore((s) => s.error);
  const match = useAudienceStore((s) => s.match);
  const tab = useAudienceStore((s) => s.tab);
  const setTab = useAudienceStore((s) => s.setTab);

  const view = useAudienceView();

  useEffect(() => {
    if (!publicSlug) return;
    void load(publicSlug);
    return () => teardown();
  }, [publicSlug, load, teardown]);

  const title = match
    ? (match.title ?? `${match.teamA.shortCode} vs ${match.teamB.shortCode}`)
    : 'Live match';

  useEffect(() => {
    if (!match) return;
    const previous = document.title;
    document.title = `${title} · CricLife`;
    return () => {
      document.title = previous;
    };
  }, [match, title]);

  const share = useCallback(() => {
    const url = `${env.VITE_PUBLIC_URL}/live/${publicSlug ?? ''}`;
    const innings = view.innings;
    const text = innings
      ? `${view.battingTeam?.shortCode ?? ''} ${innings.runs}-${innings.wickets} (${view.oversLine})`
      : title;
    // The Web Share API gives the native sheet on a phone, which is where this
    // link actually gets shared. Everything else falls back to the clipboard.
    if (typeof navigator === 'undefined') return;
    if (typeof navigator.share === 'function') {
      void navigator.share({ title, text, url }).catch(() => {
        /* the user dismissed the sheet — not an error */
      });
      return;
    }
    void navigator.clipboard?.writeText(url);
  }, [publicSlug, title, view.innings, view.battingTeam, view.oversLine]);

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <EmptyState
        title="No such match"
        body="That link doesn't point at a match. It may have been mistyped, or the match may never have been made public."
      />
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        title="Couldn't load this match"
        body={error ?? 'Something went wrong. Try again in a moment.'}
      />
    );
  }

  if (tvMode) {
    return (
      <Suspense fallback={<div className="h-[100dvh] bg-[var(--bg-base)]" />}>
        <TvLayout view={view} />
      </Suspense>
    );
  }

  return (
    <div className="pb-[calc(var(--sp-8)+var(--safe-b))]">
      <AudienceHeader
        title={title}
        subtitle={match?.venue ?? null}
        onShare={share}
        tvHref={`/live/${publicSlug ?? ''}?tv=1`}
        isComplete={view.isComplete}
      />

      <MomentOverlay view={view} />
      <CatchUpCard />

      <Hero view={view} />
      {/* A win *probability* on a finished match is nonsense — the result is
          right there above it. Requested removed, and rightly. */}
      {!view.isComplete && (
        <WinProbabilityBar
          probability={view.winProbability}
          battingTeam={view.battingTeam}
          bowlingTeam={view.bowlingTeam}
        />
      )}
      {view.isComplete && <MatchNarrative view={view} />}
      <ThisOverStrip balls={view.thisOver} />
      <BattersPanel view={view} />
      <ReplayScrubber view={view} />

      <AudienceTabs active={tab} onChange={setTab} />

      <div
        role="tabpanel"
        id={`audience-panel-${tab}`}
        aria-labelledby={`audience-tab-${tab}`}
        tabIndex={-1}
      >
        <Suspense fallback={<PanelSkeleton />}>
          {tab === 'live' && <LiveFeedTab view={view} />}
          {tab === 'scorecard' && <ScorecardTab view={view} />}
          {tab === 'squads' && <SquadsTab view={view} />}
          {tab === 'charts' && <ChartsTab view={view} />}
        </Suspense>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
      <h1 className="text-[var(--text-heading-lg)] font-semibold">{title}</h1>
      <p className="text-[var(--text-body)] text-[var(--text-secondary)]">{body}</p>
      <Link
        to="/"
        className="press mt-2 rounded-[var(--r-full)] bg-[var(--accent)] px-4 py-2 text-[var(--text-body-sm)] font-semibold text-[var(--accent-fg)]"
      >
        Go home
      </Link>
    </div>
  );
}
