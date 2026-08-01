import { Link } from 'react-router';
import { Construction } from 'lucide-react';
import { Aurora } from './Aurora';

/**
 * Phase 0 route stub. Every screen in docs/11-SCREENS-AND-ROUTES.md exists as
 * a real route from day one so navigation, layouts and code splitting can be
 * verified before any feature is built. Replace these one phase at a time.
 */
export function Placeholder({
  title,
  phase,
  doc,
  description,
}: {
  title: string;
  phase: number;
  // `| undefined` is required because tsconfig sets exactOptionalPropertyTypes
  // and the router's stub() helper forwards possibly-undefined values.
  doc?: string | undefined;
  description?: string | undefined;
}) {
  return (
    <div className="relative overflow-hidden px-4 py-10">
      <Aurora />
      <div className="panel relative mx-auto max-w-md p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-muted)]">
          <Construction size={22} className="text-[var(--accent)]" aria-hidden />
        </div>
        <h1 className="mb-1 text-[var(--text-heading-lg)]">{title}</h1>
        <p className="label-overline mb-3">Ships in Phase {phase}</p>
        {description && (
          <p className="mb-4 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
        {doc && (
          <p className="mb-5 font-mono text-[12px] text-[var(--text-tertiary)]">docs/{doc}</p>
        )}
        <Link
          to="/"
          className="press inline-flex h-10 items-center rounded-[var(--r-md)] border border-[var(--border-default)] px-4 text-[14px]"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
