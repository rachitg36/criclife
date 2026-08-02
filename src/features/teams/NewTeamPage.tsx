import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Crest } from '@/components/ui/Crest';
import { supabase } from '@/lib/supabase';

const DEFAULT_PRIMARY = '#06b6d4';

/** docs/11-SCREENS-AND-ROUTES.md § 3 — `/teams/new`. */
export function NewTeamPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColor] = useState('#a855f7');
  const [homeGround, setHomeGround] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && shortCode.trim().length === 3 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('create_team', {
      p_name: name.trim(),
      p_short_code: shortCode.trim().toUpperCase(),
      p_primary_color: primaryColor,
      p_secondary_color: secondaryColor,
      p_home_ground: homeGround.trim() || null,
      p_city: city.trim() || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }
    navigate(`/teams/${data.id}`);
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="mb-4 text-[var(--text-heading-lg)] font-bold">Create a team</h1>

      <div className="mb-6 flex items-center gap-4">
        <Crest logoUrl={null} shortCode={shortCode || '??'} color={primaryColor} size={64} />
        <div>
          <div className="font-semibold">{name || 'Your team name'}</div>
          <div className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            {shortCode.toUpperCase() || 'ABC'}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mumbai Strikers"
            className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
            required
          />
        </Field>

        <Field label="3-letter code">
          <input
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="MUM"
            maxLength={3}
            className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] tracking-widest uppercase outline-none focus:border-[var(--accent)]"
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Primary colour">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)]"
              aria-label="Primary colour"
            />
          </Field>
          <Field label="Secondary colour">
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)]"
              aria-label="Secondary colour"
            />
          </Field>
        </div>

        <Field label="Home ground">
          <input
            value={homeGround}
            onChange={(e) => setHomeGround(e.target.value)}
            className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
          />
        </Field>

        <Field label="City">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
          />
        </Field>

        {error && (
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" fullWidth disabled={!canSubmit} hapticKind="select">
          {submitting ? 'Creating…' : 'Create team'}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}
