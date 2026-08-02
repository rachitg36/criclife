import { cn } from '@/lib/cn';

/**
 * Circular team crest. Falls back to a two-letter monogram on a gradient
 * derived from the team's primary colour when there's no logo.
 * docs/08-DESIGN-SYSTEM.md § 6.
 */
export function Crest({
  logoUrl,
  shortCode,
  color = 'var(--accent)',
  size = 44,
  className,
}: {
  logoUrl?: string | null;
  shortCode: string;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${color ?? 'var(--accent)'}, color-mix(in oklch, ${color ?? 'var(--accent)'} 60%, black))`,
      }}
    >
      {shortCode.slice(0, 2).toUpperCase()}
    </div>
  );
}
