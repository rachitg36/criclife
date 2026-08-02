import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { useAuth } from './authContext';
import { useProfile } from './useProfile';

type PlayerRole = Database['public']['Enums']['player_role'];
type BattingHand = Database['public']['Enums']['batting_hand'];

const ROLE_OPTIONS: { value: PlayerRole; label: string }[] = [
  { value: 'batter', label: 'Batter' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'all_rounder', label: 'All-rounder' },
  { value: 'wicket_keeper', label: 'Wicket-keeper' },
  { value: 'wk_batter', label: 'Wicket-keeper batter' },
];

type Step = 'name' | 'role' | 'team';

/**
 * docs/11-SCREENS-AND-ROUTES.md § 1 — 3 steps (name, playing role, team),
 * plus a claimCode deep link. Step 3 deliberately stays a "skip for now" —
 * full team creation/browsing is Phase 3's own screens
 * (docs/12-ROADMAP.md Phase 3), not duplicated here.
 */
export function OnboardingPage() {
  const { session } = useAuth();
  const { data: profile, refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const claimCode = searchParams.get('claimCode');

  const [step, setStep] = useState<Step>('name');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [isPlayer, setIsPlayer] = useState<boolean | null>(null);
  const [primaryRole, setPrimaryRole] = useState<PlayerRole>('batter');
  const [battingHand, setBattingHand] = useState<BattingHand>('right');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [claimStatus, setClaimStatus] = useState<'idle' | 'claiming' | 'claimed' | 'error'>('idle');

  async function handleClaim() {
    if (!claimCode) return;
    setClaimStatus('claiming');
    const { error } = await supabase.rpc('claim_player', { p_claim_code: claimCode });
    if (error) {
      setClaimStatus('error');
      setErrorMessage(error.message);
      return;
    }
    setClaimStatus('claimed');
  }

  async function handleNameSubmit() {
    if (!session) return;
    setSaving(true);
    setErrorMessage(null);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', session.user.id);
    setSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await refetchProfile();
    setStep('role');
  }

  async function handleRoleSubmit() {
    if (!session) return;
    if (isPlayer === false) {
      setStep('team');
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    const { error } = await supabase.from('players').insert({
      profile_id: session.user.id,
      full_name: displayName || session.user.email || 'New player',
      primary_role: primaryRole,
      batting_hand: battingHand,
    });
    setSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setStep('team');
  }

  function handleFinish() {
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        {claimCode && claimStatus !== 'claimed' && (
          <Card>
            <CardHeader overline="Claim code" title="Is this player record you?" />
            <p className="mb-3 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
              Someone added you to a team before you signed up. Claim the record to link your stats
              to this account.
            </p>
            <Button
              variant="primary"
              fullWidth
              onClick={handleClaim}
              disabled={claimStatus === 'claiming'}
            >
              {claimStatus === 'claiming' ? 'Claiming…' : "Yes, that's me — claim it"}
            </Button>
            {claimStatus === 'error' && (
              <p role="alert" className="mt-2 text-[var(--text-body-sm)] text-[var(--wicket)]">
                {errorMessage}
              </p>
            )}
          </Card>
        )}
        {claimStatus === 'claimed' && (
          <Card>
            <p className="text-[var(--text-body-sm)] text-[var(--success)]">
              Player record claimed — your stats are now linked to this account.
            </p>
          </Card>
        )}

        {step === 'name' && (
          <Card>
            <CardHeader overline="Step 1 of 3" title="What should we call you?" />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="mb-3 h-12 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-2)] px-4 text-[15px] outline-none focus:border-[var(--accent)]"
            />
            <Button
              variant="primary"
              fullWidth
              onClick={handleNameSubmit}
              disabled={saving || !displayName.trim()}
            >
              {saving ? 'Saving…' : 'Continue'}
            </Button>
          </Card>
        )}

        {step === 'role' && (
          <Card>
            <CardHeader overline="Step 2 of 3" title="Are you a player?" />
            <div className="mb-4 flex gap-2">
              <Button
                variant={isPlayer === true ? 'primary' : 'secondary'}
                onClick={() => setIsPlayer(true)}
                fullWidth
              >
                Yes
              </Button>
              <Button
                variant={isPlayer === false ? 'primary' : 'secondary'}
                onClick={() => setIsPlayer(false)}
                fullWidth
              >
                Not yet
              </Button>
            </div>

            {isPlayer && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="mb-1 block text-[var(--text-body-sm)] text-[var(--text-secondary)]">
                    Primary role
                  </label>
                  <select
                    value={primaryRole}
                    onChange={(e) => setPrimaryRole(e.target.value as PlayerRole)}
                    className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-2)] px-3 text-[15px]"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[var(--text-body-sm)] text-[var(--text-secondary)]">
                    Batting hand
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant={battingHand === 'right' ? 'primary' : 'secondary'}
                      onClick={() => setBattingHand('right')}
                      fullWidth
                    >
                      Right
                    </Button>
                    <Button
                      variant={battingHand === 'left' ? 'primary' : 'secondary'}
                      onClick={() => setBattingHand('left')}
                      fullWidth
                    >
                      Left
                    </Button>
                  </div>
                </div>
                <p className="text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
                  You can change this yourself anytime — nobody else can. See
                  docs/03-ROLES-PERMISSIONS.md.
                </p>
              </div>
            )}

            <Button
              variant="primary"
              fullWidth
              onClick={handleRoleSubmit}
              disabled={saving || isPlayer === null}
            >
              {saving ? 'Saving…' : 'Continue'}
            </Button>
            {errorMessage && (
              <p role="alert" className="mt-2 text-[var(--text-body-sm)] text-[var(--wicket)]">
                {errorMessage}
              </p>
            )}
          </Card>
        )}

        {step === 'team' && (
          <Card>
            <CardHeader overline="Step 3 of 3" title="Join or create a team" />
            <p className="mb-4 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
              You can do this anytime from the Teams tab — skip for now and start exploring.
            </p>
            <Button variant="primary" fullWidth onClick={handleFinish}>
              Skip for now
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
