import Link from 'next/link';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadDeckSummaries } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { DeckList } from './decks';

export default async function StudyPage() {
  await requireOnboardedUser();
  const summaries = await loadDeckSummaries(await createClient());

  return (
    <AppPage current="study" title="Study">
      {summaries.some((d) => d.kept > 0) && (
        <div className="mb-8 flex flex-wrap gap-3">
          {summaries.some((d) => d.due + d.fresh > 0) &&<Link href="/study/review" className="btn btn-primary">Review now</Link>}
          <Link href="/study/warm-up" className="btn">Warm-up</Link>
          <Link href="/study/mastery" className="btn">Mastery map</Link>
        </div>
      )}
      <section aria-labelledby="decks">
        <h2 id="decks" className="mb-4 text-[1.44rem] font-bold">Your decks</h2>
        <DeckList decks={summaries} />
      </section>
    </AppPage>
  );
}
