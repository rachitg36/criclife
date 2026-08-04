import { Link } from 'react-router';
import { env } from '@/lib/env';

/**
 * `/settings/about` — docs/11 § 9. Deliberately includes how the rating is
 * calculated: docs/07's risk register lists "ranking formula feels unfair" as
 * a real way to lose users, and its mitigation is "publish the formula in-app".
 */
export function AboutSettings() {
  return (
    <div className="flex flex-col gap-3 p-3">
      <h1 className="px-1 text-[var(--text-heading-lg)] font-semibold">About CricLife</h1>

      <section className="panel rounded-[var(--r-lg)] p-4">
        <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Live cricket scoring, stats and rankings. Built to be scored from one phone at the
          boundary, watched by anyone on a link, and to keep working when the signal does not.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[var(--text-body-sm)]">
          <dt className="text-[var(--text-tertiary)]">Environment</dt>
          <dd className="text-right capitalize tabular-nums">{env.VITE_APP_ENV}</dd>
        </dl>
      </section>

      <section className="panel rounded-[var(--r-lg)] p-4">
        <h2 className="text-[var(--text-heading-sm)] font-semibold">How the rating works</h2>
        <p className="mt-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Every match gives you points for batting, bowling and fielding. Those are combined,
          adjusted for how strong the opposition was, and then averaged across your career with{' '}
          <strong>recent matches counting more</strong> — a match twenty games ago counts half as
          much as today&apos;s.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          <li>
            <strong className="text-[var(--text-primary)]">Batting:</strong> runs, boundaries,
            fifties and hundreds, plus a bonus for scoring faster than par for the format. A duck
            costs you; being not out for a decent score does not.
          </li>
          <li>
            <strong className="text-[var(--text-primary)]">Bowling:</strong> wickets, maidens and
            dot balls, plus a bonus for going at less than par.
          </li>
          <li>
            <strong className="text-[var(--text-primary)]">Fielding:</strong> catches, stumpings,
            run outs and assists.
          </li>
          <li>
            <strong className="text-[var(--text-primary)]">All-rounder</strong> uses a geometric
            mean, so being excellent at one discipline and hopeless at the other scores near zero.
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
          The constants behind these are a starting point, not a tuned model. They need a season of
          real matches before anyone should treat a small gap between two players as meaningful —
          which is what the confidence bars next to each rating are telling you.
        </p>
      </section>

      <section className="panel rounded-[var(--r-lg)] p-4">
        <h2 className="text-[var(--text-heading-sm)] font-semibold">Your data</h2>
        <p className="mt-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Every score in the app is derived from the ball-by-ball log, which is append-only —
          corrections are recorded as corrections, never as quiet edits.
        </p>
        <Link
          to="/settings/data"
          className="press mt-3 inline-block text-[var(--text-body-sm)] text-[var(--accent)]"
        >
          Export or delete your data →
        </Link>
      </section>

      <section className="panel rounded-[var(--r-lg)] p-4">
        <h2 className="text-[var(--text-heading-sm)] font-semibold">Who built this</h2>
        <p className="mt-2 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          CricLife is made by <strong className="text-[var(--text-primary)]">Rachit Gupta</strong>,
          for club and gully cricket — the games nobody else bothers to score properly.
        </p>
        <p className="mt-2 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Found a wrong score, a broken screen, or something a scorer needs and the app cannot do?
          Say so — a bug report from someone standing at a ground is worth more than a week of
          guessing.
        </p>
        <a
          href="mailto:rachitpublic@gmail.com?subject=CricLife"
          className="press mt-3 inline-flex text-[var(--text-body-sm)] font-semibold text-[var(--accent)] underline"
        >
          rachitpublic@gmail.com
        </a>
      </section>
    </div>
  );
}
