import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

/** docs/11-SCREENS-AND-ROUTES.md § 4 — `/players/claim`. */
export function ClaimPlayerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(searchParams.get('claimCode') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('claim_player', {
      p_claim_code: code.trim(),
    });

    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    navigate(`/players/${data.id}`);
  }

  return (
    <div className="px-4 pt-8 pb-8">
      <h1 className="mb-2 text-[var(--text-heading-lg)] font-bold">Claim your player record</h1>
      <p className="mb-6 text-[var(--text-secondary)]">
        Enter the claim code a team manager shared with you to take ownership of your player
        profile.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CLAIM CODE"
          className="h-12 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-4 text-[15px] tracking-widest uppercase outline-none focus:border-[var(--accent)]"
          required
        />
        {error && (
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" fullWidth disabled={busy || !code.trim()}>
          {busy ? 'Claiming…' : 'Claim player record'}
        </Button>
      </form>
    </div>
  );
}
