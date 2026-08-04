import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { env } from '@/lib/env';

/**
 * The spectator link, as a tap and as a square of ink.
 *
 * The share sheet covers "send it to the team group". The QR covers the ground
 * itself: print it, tape it to the scorebox or the boundary rope, and anyone
 * watching can scan it with the camera they already have — no app, no account,
 * no typing a slug. That is how people actually end up watching village
 * cricket, and it is why this is worth more than its ~600 bytes.
 *
 * `qrcode` is already a dependency (the scoring-rights handoff uses it), so
 * this adds nothing to the tree.
 */
export function ShareMatch({ publicSlug }: { publicSlug: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = `${env.VITE_PUBLIC_URL}/live/${publicSlug}`;

  useEffect(() => {
    if (!showQr) return;
    let alive = true;
    // Rendered on demand, not on mount: most visits never open it, and the
    // data URI is a few kB of string to hold for nothing.
    void QRCode.toDataURL(url, { margin: 1, width: 320 }).then((src) => {
      if (alive) setQr(src);
    });
    return () => {
      alive = false;
    };
  }, [showQr, url]);

  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Watch live on CricLife', url });
        return;
      } catch {
        // Cancelled or refused — fall through rather than leaving no result.
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth hapticKind="select" onClick={() => void share()}>
          <Share2 size={16} aria-hidden /> {copied ? 'Link copied' : 'Share link'}
        </Button>
        <Button
          variant="secondary"
          hapticKind="select"
          aria-expanded={showQr}
          onClick={() => setShowQr((v) => !v)}
        >
          <QrCode size={16} aria-hidden />
          <span className="sr-only">Show a QR code for this match</span>
        </Button>
      </div>

      {showQr && (
        <div className="panel flex flex-col items-center gap-2 p-4">
          {qr ? (
            // White plate behind it on purpose: a QR needs light quiet zones
            // to scan, and this app is dark by default (CLAUDE.md rule 7 is
            // about not inventing brand colours, not about breaking scanners).
            <img src={qr} alt={`QR code linking to ${url}`} className="rounded bg-white p-2" />
          ) : (
            <div className="h-[320px] w-[320px] max-w-full" />
          )}
          <p className="text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            Point a camera at this to watch. Print it and stick it up at the ground.
          </p>
        </div>
      )}
    </div>
  );
}
