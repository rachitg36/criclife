import { useParams } from 'react-router';
import { Placeholder } from '@/components/ui/Placeholder';

/** PHASE 7 — the public live scoreboard. docs/06-AUDIENCE-VIEW.md */
export default function AudienceRoute() {
  const { publicSlug } = useParams();
  return (
    <Placeholder
      title="Live match"
      phase={7}
      doc="06-AUDIENCE-VIEW.md"
      description={`Public, no login required. Slug: ${publicSlug ?? '—'}`}
    />
  );
}
