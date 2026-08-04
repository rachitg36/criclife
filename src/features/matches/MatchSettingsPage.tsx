import { Link, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { SkeletonText } from '@/components/ui/Skeleton';
import { resolveMaxOversPerBowler } from '@/engine/config';
import type { MatchConfig } from '@/engine/types';
import { useMatch } from './hooks';

/**
 * `/matches/:matchId/settings` — the rules this match is being played under.
 *
 * It was a `<Placeholder>` reading "Match settings ships in Phase 4", linked
 * from the scorer's Settings tab, so the one route a scorer could reach
 * mid-over was a sentence about a phase number.
 *
 * **Read-only, and that is the honest answer rather than a shortcut.** Every
 * one of these values is folded into the innings by `replay()` from ball 1:
 * change `ballsPerOver` or `playersPerSide` halfway through and the over
 * boundaries and the all-out test move under deliveries that have already been
 * scored under the old rule. docs/05 § 7 hedges with "live-editable fields
 * only" and never says which fields those are — so this screen shows what the
 * match is set to and says plainly where it can still be changed (before the
 * first ball, on `/matches/:matchId/setup`).
 */
export function MatchSettingsPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { data: match, isLoading } = useMatch(matchId);

  if (isLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <SkeletonText lines={5} />
      </div>
    );
  }
  if (!match) {
    return <div className="px-4 pt-8 text-[var(--text-secondary)]">Match not found.</div>;
  }

  const config = match.config as unknown as MatchConfig;
  const started = match.status !== 'scheduled' && match.status !== 'toss';

  return (
    <div className="px-4 pt-4 pb-8">
      <Link
        to={`/matches/${match.id}`}
        className="mb-3 inline-flex items-center gap-1 text-[var(--text-body-sm)] text-[var(--accent)]"
      >
        <ChevronLeft size={15} aria-hidden /> Match hub
      </Link>
      <h1 className="mb-1 text-[var(--text-heading-lg)] font-bold">Match settings</h1>
      <p className="mb-4 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        {started
          ? 'Fixed for this match. Every score on every screen is replayed from ball 1 under these rules, so changing them mid-match would rewrite deliveries already scored.'
          : 'Change these on the setup screen, up until the first ball.'}
      </p>

      {!started && (
        <Link to={`/matches/${match.id}/setup`} className="mb-4 block">
          <span className="press block rounded-[var(--r-md)] bg-[var(--accent)] px-4 py-3 text-center text-[14px] font-semibold text-[var(--accent-fg)]">
            Edit on the setup screen
          </span>
        </Link>
      )}

      <Group title="Format">
        <Row label="Overs per innings" value={String(config.oversPerInnings)} />
        <Row label="Balls per over" value={String(config.ballsPerOver)} />
        <Row label="Players a side" value={String(config.playersPerSide)} />
        <Row
          label="Max overs per bowler"
          value={
            config.maxOversPerBowler === 'auto'
              ? `${resolveMaxOversPerBowler(config)} (auto)`
              : String(config.maxOversPerBowler)
          }
        />
        {config.rulesProfileName && <Row label="Rules profile" value={config.rulesProfileName} />}
      </Group>

      <Group title="Extras">
        <Row label="Runs for a wide" value={String(config.wideRuns)} />
        <Row label="Runs for a no-ball" value={String(config.noBallRuns)} />
        <Row label="Byes" value={onOff(config.byesEnabled)} />
        <Row label="Leg byes" value={onOff(config.legByesEnabled)} />
        <Row label="Penalty runs" value={onOff(config.penaltyRunsEnabled)} />
      </Group>

      <Group title="Free hits and wickets">
        <Row label="Free hit after a no-ball" value={onOff(config.freeHitAfterNoBall)} />
        <Row label="…after every kind of no-ball" value={onOff(config.noBallFreeHitOnAllNoBalls)} />
        <Row label="Last man standing" value={onOff(config.lastManStanding)} />
        <Row label="Retired hurt can return" value={onOff(config.retiredHurtCanReturn)} />
      </Group>

      <Group title="Result">
        <Row label="Super over on a tie" value={onOff(config.superOverOnTie)} />
        <Row label="Declarations" value={onOff(config.declarationsEnabled)} />
        <Row label="Follow-on" value={onOff(config.followOnEnabled)} />
        <Row label="DRS" value={onOff(config.drsEnabled)} />
        <Row
          label="Powerplays"
          value={config.powerplays.length === 0 ? 'None' : `${config.powerplays.length} set`}
        />
      </Group>
    </div>
  );
}

function onOff(v: boolean): string {
  return v ? 'On' : 'Off';
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h2 className="label-overline mb-2">{title}</h2>
      <div className="panel overflow-hidden rounded-[var(--r-lg)] p-0">
        <dl>{children}</dl>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 last:border-b-0">
      <dt className="min-w-0 flex-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        {label}
      </dt>
      <dd className="shrink-0 text-[var(--text-body-sm)] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
