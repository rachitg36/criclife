import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { QrCode, Share2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { env } from '@/lib/env';
import { useUiStore } from '@/stores/uiStore';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 7 — theme, haptics, handedness. Match config's
    "live-editable fields only" isn't built here: docs doesn't say which
    fields qualify, and Phase 4 already stubbed a dedicated match-settings
    route — linking to it avoids duplicating that decision. */
export function SettingsTab() {
  const { matchId } = useParams();
  const publicSlug = useScorerStore((s) => s.publicSlug);
  const [shared, setShared] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  // Imported inside the effect, not at module scope: `qrcode` is ~25 kB and
  // the scorer route is the one screen that has to open instantly on a phone
  // at a ground. Nobody who never opens this pays for it.
  useEffect(() => {
    if (!qrOpen || !publicSlug) return;
    let alive = true;
    void import('qrcode').then((m) =>
      m.default
        .toDataURL(`${env.VITE_PUBLIC_URL}/live/${publicSlug}`, { margin: 1, width: 320 })
        .then((src) => {
          if (alive) setQr(src);
        })
    );
    return () => {
      alive = false;
    };
  }, [qrOpen, publicSlug]);

  // The scorer is the one person who needs to hand out the spectator link, and
  // the only share button lived on the audience view — a screen they would
  // have to leave the pad to reach. Native share sheet where there is one, so
  // it lands in WhatsApp in two taps; clipboard everywhere else.
  async function shareLink() {
    if (!publicSlug) return;
    const url = `${env.VITE_PUBLIC_URL}/live/${publicSlug}`;
    const title = 'Watch live on CricLife';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelled, or the sheet refused. Fall through to the clipboard
        // rather than leaving the scorer with nothing.
      }
    }
    await navigator.clipboard?.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }
  const scorerHand = useUiStore((s) => s.scorerHand);
  const setScorerHand = useUiStore((s) => s.setScorerHand);
  const hapticsEnabled = useUiStore((s) => s.hapticsEnabled);
  const toggleHaptics = useUiStore((s) => s.toggleHaptics);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const toggleSound = useUiStore((s) => s.toggleSound);
  const keepScreenAwake = useUiStore((s) => s.keepScreenAwake);
  const setKeepScreenAwake = useUiStore((s) => s.setKeepScreenAwake);
  const advancedScoring = useUiStore((s) => s.advancedScoring);
  const setAdvancedScoring = useUiStore((s) => s.setAdvancedScoring);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      <div className="flex flex-col gap-4">
        <Row label="Theme">
          <ThemeToggle compact />
        </Row>

        <Row label="Scoring hand" hint="Mirrors WICKET/UNDO to your thumb.">
          <div className="flex gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] p-0.5">
            {(['left', 'right'] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setScorerHand(h)}
                className={
                  'press rounded-full px-3 py-1.5 text-[13px] font-medium capitalize ' +
                  (scorerHand === h
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'text-[var(--text-secondary)]')
                }
              >
                {h}
              </button>
            ))}
          </div>
        </Row>

        <ToggleRow label="Haptics" value={hapticsEnabled} onChange={toggleHaptics} />
        <ToggleRow label="Sound" value={soundEnabled} onChange={toggleSound} />
        <ToggleRow
          label="Keep screen awake"
          hint="Prevents the phone from sleeping mid-over."
          value={keepScreenAwake}
          onChange={() => setKeepScreenAwake(!keepScreenAwake)}
        />
        <ToggleRow
          label="Advanced scoring"
          hint="Tap the field after a scoring shot, for the wagon wheel. Optional every ball."
          value={advancedScoring}
          onChange={() => setAdvancedScoring(!advancedScoring)}
        />

        {publicSlug && (
          <>
            <button
              type="button"
              onClick={() => void shareLink()}
              className="press mt-2 flex min-h-12 items-center justify-center gap-2 rounded-[var(--r-md)] bg-[var(--accent)] text-[14px] font-semibold text-[var(--accent-fg)]"
            >
              <Share2 size={15} aria-hidden />
              {shared ? 'Link copied' : 'Share the live link'}
            </button>
            {/* The QR is for the people standing in front of you. Sharing a
                link works for the team group; a spectator who has just walked
                up to the boundary has nothing to tap. `qrcode` is loaded on
                demand so the pad does not carry it. */}
            <button
              type="button"
              onClick={() => setQrOpen((v) => !v)}
              aria-expanded={qrOpen}
              className="press flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-md)] border border-[var(--border-default)] text-[13px] font-medium text-[var(--text-secondary)]"
            >
              <QrCode size={15} aria-hidden />
              {qrOpen ? 'Hide QR code' : 'Show a QR code'}
            </button>
            {qrOpen && qr && (
              <img
                src={qr}
                alt="QR code for this match's live link"
                className="mx-auto w-full max-w-[220px] rounded bg-white p-2"
              />
            )}
          </>
        )}

        {/* Which build this device is running. The service worker never
            auto-reloads (CLAUDE.md rule 6), so a stale tab is indistinguishable
            from a bug that was fixed days ago — and repeatedly has been. */}
        <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">CricLife {__APP_BUILD__}</p>

        {matchId && (
          <Link
            to={`/matches/${matchId}/settings`}
            className="mt-2 text-[13px] text-[var(--accent)] underline"
          >
            Match settings →
          </Link>
        )}

        {/* Rain stops play while you are holding the pad, not while you are
            browsing the match hub — so the way out has to be reachable from
            in here. It is still the hub's `abandon_match`; this is a link to
            it, not a second implementation. */}
        {matchId && (
          <Link
            to={`/matches/${matchId}`}
            className="press mt-1 flex min-h-12 items-center justify-center rounded-[var(--r-md)] border border-[var(--danger)] text-[14px] font-semibold text-[var(--danger)]"
          >
            Abandon this match
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[14px] font-medium text-[var(--text-primary)]">{label}</div>
        {hint && <div className="text-[12px] text-[var(--text-tertiary)]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <Row label={label} {...(hint ? { hint } : {})}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={onChange}
        className={
          'press h-7 w-12 rounded-full p-1 transition-colors ' +
          (value ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)]')
        }
      >
        <span
          className={
            'block h-5 w-5 rounded-full bg-white transition-transform ' +
            (value ? 'translate-x-5' : 'translate-x-0')
          }
        />
      </button>
    </Row>
  );
}
