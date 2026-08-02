import { cn } from '@/lib/cn';

function hashHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % 360;
}

/**
 * Circular player photo, or a generated initials-on-gradient fallback hashed
 * from the name so the same player always gets the same colour.
 * docs/08-DESIGN-SYSTEM.md § 6.
 */
export function Avatar({
  photoUrl,
  name,
  size = 40,
  className,
}: {
  photoUrl?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const hue = hashHue(name || '?');
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, oklch(0.6 0.15 ${hue}), oklch(0.4 0.15 ${(hue + 40) % 360}))`,
      }}
    >
      {initials || '?'}
    </div>
  );
}
