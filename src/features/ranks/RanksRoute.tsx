import { Placeholder } from '@/components/ui/Placeholder';

/**
 * PHASE 8 — the Ranks page.
 * Defaults to the unfiltered global board across every player of every team;
 * team chips narrow the population without changing the ratings.
 * docs/07-STATS-AND-RANKINGS.md § 3
 */
export default function RanksRoute() {
  return (
    <Placeholder
      title="Rankings"
      phase={8}
      doc="07-STATS-AND-RANKINGS.md"
      description="Overall, Batting, Bowling, All-rounder and Fielding boards. Global by default, filterable by any set of teams."
    />
  );
}
