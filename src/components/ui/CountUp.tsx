import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * Spring-animated number. Always tabular-nums so the container never
 * reflows as digits change — a jittering score is unusable.
 * docs/08-DESIGN-SYSTEM.md § 4
 */
export function CountUp({
  value,
  className,
  decimals = 0,
}: {
  value: number;
  className?: string;
  decimals?: number;
}) {
  const source = useMotionValue(value);
  const spring = useSpring(source, { stiffness: 180, damping: 26 });
  const text = useTransform(spring, (v) => v.toFixed(decimals));

  useEffect(() => {
    source.set(value);
  }, [value, source]);

  return (
    <motion.span className={cn('tnum tabular-nums', className)} aria-label={String(value)}>
      {text}
    </motion.span>
  );
}
