import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { List, Network } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonText } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { useMatch, useMatchGrants, type MatchGrant } from './hooks';

/**
 * docs/03-ROLES-PERMISSIONS.md § 3.4 — the Scoring Rights Map. A signature
 * screen with an animated graph, and a fully equivalent accessible list view
 * (docs/08 § 8: "The Scoring Rights Map has a fully equivalent list view").
 * Live-updates over Supabase Realtime so a revocation is visible instantly to
 * anyone watching.
 */
export function ScoringRightsMapPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const queryClient = useQueryClient();
  const { data: match } = useMatch(matchId);
  const { data: grants, isLoading } = useMatchGrants(matchId);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`scoring-grants:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scoring_grants', filter: `match_id=eq.${matchId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['matchGrants', matchId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, queryClient]);

  if (isLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <SkeletonText lines={4} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8">
      {match?.title && <p className="label-overline mb-1">{match.title}</p>}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[var(--text-heading-lg)] font-bold">Scoring rights</h1>
        <div className="flex gap-1">
          <Button
            variant={view === 'list' ? 'primary' : 'ghost'}
            size="sm"
            aria-label="List view"
            onClick={() => setView('list')}
          >
            <List size={16} aria-hidden />
          </Button>
          <Button
            variant={view === 'map' ? 'primary' : 'ghost'}
            size="sm"
            aria-label="Map view"
            onClick={() => setView('map')}
          >
            <Network size={16} aria-hidden />
          </Button>
        </div>
      </div>

      {view === 'list' ? (
        <GrantList matchId={matchId!} grants={grants ?? []} />
      ) : (
        <GrantGraph matchId={matchId!} grants={grants ?? []} />
      )}

      <Button
        variant="secondary"
        fullWidth
        className="mt-4"
        disabled={issuing}
        onClick={() => setIssuing(true)}
      >
        + Give scoring rights
      </Button>
      {issuing && (
        <IssueGrantForm
          matchId={matchId!}
          onClose={() => setIssuing(false)}
          onIssued={() => queryClient.invalidateQueries({ queryKey: ['matchGrants', matchId] })}
        />
      )}
    </div>
  );
}

function GrantList({ matchId, grants }: { matchId: string; grants: MatchGrant[] }) {
  if (grants.length === 0) {
    return (
      <div className="panel p-5 text-center text-[var(--text-secondary)]">
        Nobody holds scoring rights yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {grants.map((grant) => (
        <GrantRow key={grant.id} matchId={matchId} grant={grant} />
      ))}
    </ul>
  );
}

const STATUS_LABEL: Record<MatchGrant['status'], string> = {
  active: 'Active',
  revoked: 'Revoked',
  expired: 'Expired',
  transferred: 'Passed on',
};

function GrantRow({ matchId, grant }: { matchId: string; grant: MatchGrant }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['matchGrants', matchId] });
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('revoke_scoring_grant', {
      p_grant_id: grant.id,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    await invalidate();
  }

  return (
    <li className="panel p-3">
      <div className="flex items-center gap-3">
        <Avatar photoUrl={grant.grantee_avatar_url} name={grant.grantee_display_name} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{grant.grantee_display_name}</div>
          <div className="flex gap-2 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            <span
              className={
                grant.status === 'active' ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'
              }
            >
              {grant.status === 'active' && <span aria-hidden>&#9679; </span>}
              {STATUS_LABEL[grant.status]}
            </span>
            {grant.scope !== 'full' && <span>{grant.scope}</span>}
          </div>
        </div>
      </div>

      {grant.status === 'active' && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">
          <Button variant="danger" size="sm" disabled={busy} onClick={revoke}>
            Revoke
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowQr((v) => !v)}>
            Handoff QR
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[var(--text-body-sm)] text-[var(--danger)]">
          {error}
        </p>
      )}

      {showQr && <HandoffQr matchId={matchId} onClose={() => setShowQr(false)} />}
    </li>
  );
}

function HandoffQr({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('create_handoff_token', {
        p_match_id: matchId,
        p_ttl_seconds: 300,
      });
      if (cancelled) return;
      if (rpcError) return setError(rpcError.message);
      const url = `${window.location.origin}/redeem-grant/${data.token}`;
      const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
      if (!cancelled) setDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  return (
    <div className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-center">
      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}
      {dataUrl ? (
        <img src={dataUrl} alt="Scan to receive scoring rights" className="mx-auto h-40 w-40" />
      ) : (
        !error && <p className="text-[var(--text-secondary)]">Generating…</p>
      )}
      <p className="mt-2 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        Valid for 5 minutes, single use.
      </p>
      <Button variant="ghost" size="sm" onClick={onClose} className="mt-1">
        Close
      </Button>
    </div>
  );
}

function IssueGrantForm({
  matchId,
  onClose,
  onIssued,
}: {
  matchId: string;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { id: string; display_name: string; handle: string | null; avatar_url: string | null }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    const { data, error: rpcError } = await supabase.rpc('search_profiles', {
      p_query: query.trim(),
    });
    if (rpcError) return setError(rpcError.message);
    setResults(data ?? []);
  }

  async function issue(profileId: string) {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('issue_scoring_grant', {
      p_match_id: matchId,
      p_grantee_profile_id: profileId,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    onIssued();
    onClose();
  }

  return (
    <div className="panel mt-3 space-y-3 p-4">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by handle or email"
          className="h-10 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 text-[14px]"
        />
        <Button variant="secondary" size="sm" onClick={search}>
          Search
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {results.map((profile) => (
          <li key={profile.id} className="flex items-center gap-3">
            <Avatar photoUrl={profile.avatar_url} name={profile.display_name} size={32} />
            <span className="min-w-0 flex-1 truncate">{profile.display_name}</span>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => issue(profile.id)}>
              Give rights
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}

/** A simplified radial graph — same data and actions as the list, laid out visually. */
function GrantGraph({ matchId, grants }: { matchId: string; grants: MatchGrant[] }) {
  const active = grants.filter((g) => g.status === 'active');
  const others = grants.filter((g) => g.status !== 'active');
  const radius = 100;
  const center = 130;

  return (
    <div>
      <svg
        viewBox="0 0 260 260"
        className="mx-auto w-full max-w-xs"
        role="img"
        aria-label="Scoring rights graph"
      >
        <circle
          cx={center}
          cy={center}
          r={28}
          fill="var(--accent-muted)"
          stroke="var(--accent)"
          strokeWidth={2}
        />
        <text
          x={center}
          y={center + 4}
          textAnchor="middle"
          fontSize={11}
          fill="var(--text-primary)"
        >
          MATCH
        </text>
        {active.map((grant, i) => {
          const angle = (i / Math.max(active.length, 1)) * 2 * Math.PI - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          return (
            <g key={grant.id}>
              <line
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="var(--accent-glow)"
                strokeWidth={2}
              />
              <circle
                cx={x}
                cy={y}
                r={22}
                fill="var(--surface-2)"
                stroke="var(--success)"
                strokeWidth={2}
              />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={9} fill="var(--text-primary)">
                {grant.grantee_display_name.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
      {others.length > 0 && (
        <p className="mt-2 text-center text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
          {others.length} past grant{others.length === 1 ? '' : 's'} — switch to list view for
          history.
        </p>
      )}
      <div className="mt-4">
        <GrantList matchId={matchId} grants={active} />
      </div>
    </div>
  );
}
