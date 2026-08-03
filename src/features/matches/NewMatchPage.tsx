import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Crest } from '@/components/ui/Crest';
import { supabase } from '@/lib/supabase';
import { RULES_PROFILES, createCustomConfig, resolveMaxOversPerBowler } from '@/engine/config';
import type { MatchConfig } from '@/engine/types';
import { useAllTeams, useMyTeams, type Team } from '@/features/teams/hooks';
import type { Json } from '@/types/database';

type ProfileKey = keyof typeof RULES_PROFILES | 'custom';

const PROFILE_LABELS: Record<ProfileKey, string> = {
  t20: 'T20 Standard',
  odi: 'ODI Standard',
  t10: 'T10',
  theHundred: 'The Hundred',
  gully8: 'Gully 8',
  custom: 'Custom',
};

const STEP_LABELS = ['Teams', 'Format & settings', 'Venue & time', 'Scoring rights'] as const;

/** docs/11-SCREENS-AND-ROUTES.md § 5 — `/matches/new`, the 4-step wizard. */
export function NewMatchPage() {
  const navigate = useNavigate();
  const { data: myTeams } = useMyTeams();
  const [step, setStep] = useState(0);

  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');

  const [profileKey, setProfileKey] = useState<ProfileKey>('t20');
  const [config, setConfig] = useState<MatchConfig>(RULES_PROFILES.t20);

  const [venue, setVenue] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [title, setTitle] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyProfile(key: ProfileKey) {
    setProfileKey(key);
    setConfig(key === 'custom' ? createCustomConfig(config) : RULES_PROFILES[key]);
  }

  const canProceedTeams = !!teamAId && !!teamBId && teamAId !== teamBId;

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('create_match', {
      p_team_a_id: teamAId,
      p_team_b_id: teamBId,
      p_config: config as unknown as Json,
      p_title: title.trim() || null,
      p_venue: venue.trim() || null,
      p_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setSubmitting(false);
    if (rpcError) return setError(rpcError.message);
    navigate(`/matches/${data.id}/setup`);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col px-4 pt-4 pb-8">
      <div className="mb-4">
        <div className="mb-2 flex gap-1">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={
                i <= step
                  ? 'h-1 flex-1 rounded-full bg-[var(--accent)]'
                  : 'h-1 flex-1 rounded-full bg-[var(--border-subtle)]'
              }
            />
          ))}
        </div>
        <h1 className="text-[var(--text-heading-lg)] font-bold">
          {step + 1}. {STEP_LABELS[step]}
        </h1>
      </div>

      <div className="flex-1">
        {step === 0 && (
          <TeamsStep
            myTeams={myTeams ?? []}
            teamAId={teamAId}
            teamBId={teamBId}
            onTeamA={setTeamAId}
            onTeamB={setTeamBId}
          />
        )}
        {step === 1 && (
          <FormatStep
            profileKey={profileKey}
            config={config}
            onProfile={applyProfile}
            onConfig={setConfig}
          />
        )}
        {step === 2 && (
          <VenueStep
            title={title}
            venue={venue}
            scheduledAt={scheduledAt}
            onTitle={setTitle}
            onVenue={setVenue}
            onScheduledAt={setScheduledAt}
          />
        )}
        {step === 3 && <RightsStep />}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < 3 ? (
          <Button
            variant="primary"
            fullWidth
            disabled={step === 0 && !canProceedTeams}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        ) : (
          <Button variant="primary" fullWidth disabled={submitting} onClick={handleCreate}>
            {submitting ? 'Creating…' : 'Create match'}
          </Button>
        )}
      </div>
    </div>
  );
}

function TeamsStep({
  myTeams,
  teamAId,
  teamBId,
  onTeamA,
  onTeamB,
}: {
  myTeams: Team[];
  teamAId: string;
  teamBId: string;
  onTeamA: (id: string) => void;
  onTeamB: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const { data: allTeams } = useAllTeams(search);
  const options = search.trim()
    ? (allTeams ?? [])
    : myTeams.length > 0
      ? myTeams
      : (allTeams ?? []);

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search all teams"
        className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
      />
      <TeamPicker label="Team A" options={options} selectedId={teamAId} onSelect={onTeamA} />
      <TeamPicker label="Team B" options={options} selectedId={teamBId} onSelect={onTeamB} />
      {teamAId && teamBId && teamAId === teamBId && (
        <p className="text-[var(--danger)]">A team can't play itself.</p>
      )}
    </div>
  );
}

function TeamPicker({
  label,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  options: Team[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="label-overline mb-2">{label}</div>
      <ul className="space-y-2">
        {options.map((team) => (
          <li key={team.id}>
            <button
              type="button"
              onClick={() => onSelect(team.id)}
              className={
                selectedId === team.id
                  ? 'panel flex w-full items-center gap-3 border-[var(--accent)] p-3 text-left'
                  : 'panel flex w-full items-center gap-3 p-3 text-left'
              }
            >
              <Crest
                logoUrl={team.logo_url}
                shortCode={team.short_code}
                color={team.primary_color}
              />
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormatStep({
  profileKey,
  config,
  onProfile,
  onConfig,
}: {
  profileKey: ProfileKey;
  config: MatchConfig;
  onProfile: (key: ProfileKey) => void;
  onConfig: (config: MatchConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="label-overline mb-2">Rules profile</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PROFILE_LABELS) as ProfileKey[]).map((key) => (
            <Button
              key={key}
              variant={profileKey === key ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onProfile(key)}
            >
              {PROFILE_LABELS[key]}
            </Button>
          ))}
        </div>
      </div>

      <NumberField
        label="Overs per innings"
        value={config.oversPerInnings}
        min={1}
        max={90}
        onChange={(v) => onConfig({ ...config, oversPerInnings: v })}
      />
      <NumberField
        label="Balls per over"
        value={config.ballsPerOver}
        min={4}
        max={8}
        onChange={(v) => onConfig({ ...config, ballsPerOver: v })}
      />
      {/* Two is the real floor: a striker and a non-striker. Anything above
          that is somebody's actual game — gully cricket is played 3-a-side and
          up. This used to start at 5, which quietly refused matches people
          play every weekend. Everything downstream reads `playersPerSide`
          (all-out is `playersPerSide - 1`), so nothing here assumes eleven. */}
      <NumberField
        label="Players per side"
        value={config.playersPerSide}
        min={2}
        max={15}
        onChange={(v) => onConfig({ ...config, playersPerSide: v })}
      />
      <NumberField
        label="Max overs per bowler"
        value={resolveMaxOversPerBowler(config)}
        min={1}
        max={config.oversPerInnings}
        onChange={(v) => onConfig({ ...config, maxOversPerBowler: v })}
      />

      <ToggleField
        label="Free hit after a no-ball"
        checked={config.freeHitAfterNoBall}
        onChange={(v) => onConfig({ ...config, freeHitAfterNoBall: v })}
      />
      <ToggleField
        label="Super over on a tie"
        checked={config.superOverOnTie}
        onChange={(v) => onConfig({ ...config, superOverOnTie: v })}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[15px]">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 w-24 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 text-right tabular-nums"
      />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[15px]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--accent)]"
      />
    </label>
  );
}

function VenueStep({
  title,
  venue,
  scheduledAt,
  onTitle,
  onVenue,
  onScheduledAt,
}: {
  title: string;
  venue: string;
  scheduledAt: string;
  onTitle: (v: string) => void;
  onVenue: (v: string) => void;
  onScheduledAt: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Title (optional)
        </span>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Final"
          className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Venue
        </span>
        <input
          value={venue}
          onChange={(e) => onVenue(e.target.value)}
          className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Scheduled time
        </span>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => onScheduledAt(e.target.value)}
          className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        />
      </label>
    </div>
  );
}

function RightsStep() {
  return (
    <div className="panel p-4 text-[var(--text-secondary)]">
      You'll hold scoring rights on this match as soon as it's created. Add more scorers, pass
      rights, or generate a handoff QR from the Scoring Rights Map afterward.
    </div>
  );
}
