import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { supabase } from '@/lib/supabase';

/**
 * docs/03-ROLES-PERMISSIONS.md § 3.5 — the handoff QR encodes this URL, so
 * any phone camera app can act on it (no in-app scanner needed). Sits under
 * the RequireAuth branch, so a session is guaranteed by the time this
 * mounts — redeems immediately and drops the new holder into the match hub.
 */
export function RedeemGrantPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('redeem_handoff_token', {
        p_token: token,
      });
      if (cancelled) return;
      if (rpcError) return setError(rpcError.message);
      navigate(`/matches/${data.match_id}`, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  if (error) {
    return (
      <div className="px-4 pt-12 text-center">
        <p className="text-[var(--danger)]">{error}</p>
        <Link to="/" className="mt-4 inline-block underline">
          Back to home
        </Link>
      </div>
    );
  }

  return <div className="px-4 pt-12 text-center text-[var(--text-secondary)]">Redeeming…</div>;
}
