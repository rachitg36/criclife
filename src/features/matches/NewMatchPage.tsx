import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Crest } from '@/components/ui/Crest';
import { supabase } from '@/lib/supabase';
import { RULES_PROFILES, createCustomConfig, resolveMaxOversPerBowler } from '@/engine/config';
import type { MatchConfig } from '@/engine/types';
import { useAllTeams, useMyTeams, type Team } from '@/features/teams/hooks';
import type { Json } from '@/types/database';
import { defaultMatchTitle, toDateTimeLocal } from './newMatchDefaults';
import { useMatches } from '@/features/matches/hooks';

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

  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  
  const teamAId = teamA?.id ?? '';
  const teamBId = teamB?.id ?? '';

  const [profileKey, setProfileKey] = useState<ProfileKey>('t20');
  const [config, setConfig] = useState<MatchConfig>(RULES_PROFILES.t20);

  const [venue, setVenue] = useState('');
  // Now, in the browser's own timezone. A match is nearly always being created
  // for the moment it is being created in, and both fields starting blank is
  // how one ended up named "1" with no date on it.
  const [scheduledAt, setScheduledAt] = useState(() => toDateTimeLocal(new Date()));
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyProfile(key: ProfileKey) {
    setProfileKey(key);
    // `createCustomConfig()` with no argument, deliberately: picking Custom
    // now *resets* to the short-game defaults rather than inheriting whatever
    // profile happened to be selected. Carrying the old values over made
    // "Custom" mean "T20, but editable", which is not what it is for.
    setConfig(key === 'custom' ? createCustomConfig() : RULES_PROFILES[key]);
  }

  const canProceedTeams = !!teamAId && !!teamBId && teamAId !== teamBId;

  // Shown as the title field's placeholder and used verbatim if it is left
  // blank, so the fast path through the wizard still produces a named match.
  // Only `myTeams` is searched, so a side picked out of the all-teams search
  // yields no suggestion and the field falls back to its old placeholder —
  // the names for those live inside TeamsStep and are not worth lifting yet.
  // Written into the field, not just offered as a placeholder. The suggestion
  // was already good enough to be used verbatim on submit, so leaving the box
  // visibly empty only made people type what the app had already decided —
  // "by default, add the title". Still fully editable, and only ever filled
  // while the field is untouched (`titleTouched`), so it never overwrites
  // something typed.
  const suggestedTitle = defaultMatchTitle(
    teamA?.short_code,
    teamB?.short_code,
    new Date()
  );

  useEffect(() => {
    if (titleTouched || !suggestedTitle) return;
    setTitle(suggestedTitle);
  }, [suggestedTitle, titleTouched]);

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('create_match', {
      p_team_a_id: teamAId,
      p_team_b_id: teamBId,
      p_config: config as unknown as Json,
      p_title: title.trim() || suggestedTitle,
      p_venue: venue.trim() || null,
      p_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setSubmitting(false);
    if (rpcError) return setError(rpcError.message);
    navigate(`/matches/${data.id}/setup`);
  }

  // `min-h-full`, not `min-h-[100dvh]`. AppLayout's <main> already reserves
  // room for the tab bar below its children; a child forced to a full viewport
  // height pushes its own bottom row to the viewport edge, which is *behind*
  // that bar. The Back/Next buttons were half-hidden by it.
  return (
    <div className="flex min-h-full flex-col px-4 pt-4 pb-8">
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
            teamA={teamA}
            teamB={teamB}
            onTeamA={setTeamA}
            onTeamB={setTeamB}
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
            suggestedTitle={suggestedTitle}
            venue={venue}
            scheduledAt={scheduledAt}
            onTitle={(v) => {
              setTitleTouched(true);
              setTitle(v);
            }}
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
  teamA,
  teamB,
  onTeamA,
  onTeamB,
}: {
  myTeams: Team[];
  teamA: Team | null;
  teamB: Team | null;
  onTeamA: (team: Team | null) => void;
  onTeamB: (team: Team | null) => void;
}) {
  const [search, setSearch] = useState('');
  const { data: allTeams } = useAllTeams(search);
  const { data: matches } = useMatches();
  
  const liveMatchTeams = new Set<string>();
  if (matches) {
    for (const m of matches) {
      if (m.status === 'live' || m.status === 'innings_break' || m.status === 'super_over') {
        liveMatchTeams.add((m as any).team_a_id);
        liveMatchTeams.add((m as any).team_b_id);
      }
    }
  }
  
  const isAvailable = (t: Team) => !liveMatchTeams.has(t.id) && t.id !== teamA?.id && t.id !== teamB?.id;

  const filteredMyTeams = myTeams.filter(isAvailable);
  const rawOptions = search.trim()
    ? (allTeams ?? [])
    : [
        ...filteredMyTeams,
        ...(allTeams ?? []).filter((at) => !filteredMyTeams.some((mt) => mt.id === at.id)),
      ];
      
  const options = rawOptions.filter(isAvailable);

  const handleSelect = (team: Team) => {
    if (!teamA) {
      onTeamA(team);
      setSearch('');
    } else if (!teamB) {
      onTeamB(team);
      setSearch('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner */}
      {(teamA || teamB) && (
        <div className="panel flex items-center justify-between p-3 gap-2 bg-[var(--surface-2)]">
          <div className="flex-1 min-w-0">
            {teamA ? (
              <div className="flex items-center gap-2">
                <Crest logoUrl={teamA.logo_url} shortCode={teamA.short_code} color={teamA.primary_color} size={24} />
                <span className="font-semibold truncate text-[15px]">{teamA.name}</span>
                <button
                  type="button"
                  onClick={() => onTeamA(null)}
                  className="p-1 text-[var(--danger)] active:bg-[var(--surface-3)] rounded-full"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <span className="text-[var(--text-tertiary)] italic">Choose team A...</span>
            )}
          </div>
          
          <span className="text-[14px] font-bold text-[var(--text-secondary)] px-2 shrink-0">v</span>
          
          <div className="flex-1 min-w-0 flex justify-end">
            {teamB ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onTeamB(null)}
                  className="p-1 text-[var(--danger)] active:bg-[var(--surface-3)] rounded-full"
                >
                  <X size={16} />
                </button>
                <span className="font-semibold truncate text-[15px] text-right">{teamB.name}</span>
                <Crest logoUrl={teamB.logo_url} shortCode={teamB.short_code} color={teamB.primary_color} size={24} />
              </div>
            ) : (
              <span className="text-[var(--text-tertiary)] italic">Choose opponent...</span>
            )}
          </div>
        </div>
      )}
      
      {teamA?.id === teamB?.id && teamA !== null && (
        <p className="text-[var(--danger)]">A team can't play itself.</p>
      )}

      {(!teamA || !teamB) && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all teams"
            className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
          />
          <div>
            <div className="label-overline mb-2">
              {!teamA ? 'Select Team A' : 'Select Opponent'}
            </div>
            <ul className="space-y-2">
              {options.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(team)}
                    className="panel flex w-full items-center gap-3 p-3 text-left press"
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
        </>
      )}
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
  suggestedTitle,
  venue,
  scheduledAt,
  onTitle,
  onVenue,
  onScheduledAt,
}: {
  title: string;
  suggestedTitle: string | null;
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
          // Focused on arrival. This is the first thing the step asks for, and
          // a screen that wants input should not also want a tap to say so.
          autoFocus
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={suggestedTitle ?? 'Final'}
          className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        />
        {suggestedTitle && !title.trim() && (
          <span className="mt-1 block text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
            Leave blank and it will be called “{suggestedTitle}”.
          </span>
        )}
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
