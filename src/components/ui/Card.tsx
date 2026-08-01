import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel p-4', className)} {...rest} />;
}

export function CardHeader({
  title,
  action,
  overline,
}: {
  title: ReactNode;
  action?: ReactNode;
  overline?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {overline && <div className="label-overline mb-0.5">{overline}</div>}
        <h3 className="truncate text-[var(--text-heading-md)] font-semibold">{title}</h3>
      </div>
      {action}
    </div>
  );
}
