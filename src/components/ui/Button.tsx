import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { haptic, type HapticKind } from '@/lib/haptics';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
type Size = 'sm' | 'md' | 'lg' | 'pad';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 glow-accent',
  secondary:
    'bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-strong)]',
  ghost:
    'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]',
  danger: 'bg-[var(--wicket)] text-white hover:brightness-110',
  glass: 'panel text-[var(--text-primary)] hover:border-[var(--border-strong)] backdrop-blur-xl',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] rounded-[var(--r-sm)]',
  md: 'h-11 px-4 text-[15px] rounded-[var(--r-md)]',
  lg: 'h-14 px-6 text-[17px] rounded-[var(--r-lg)] font-semibold',
  /** Scorer pad target — 56px minimum, well above the 44px guideline. */
  pad: 'min-h-14 min-w-14 text-[20px] rounded-[var(--r-md)] font-bold',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Fires a vibration on press. Leave unset for non-scoring UI. */
  hapticKind?: HapticKind;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', hapticKind, fullWidth, className, onClick, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'press inline-flex items-center justify-center gap-2 font-medium select-none',
        'disabled:pointer-events-none disabled:opacity-40',
        'transition-[transform,background-color,border-color,filter] duration-[var(--dur-fast)]',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      onClick={(e) => {
        if (hapticKind) haptic(hapticKind);
        onClick?.(e);
      }}
      {...rest}
    />
  );
});
