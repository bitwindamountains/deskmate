import Link from 'next/link';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { DeckList, type DeckSummary } from './decks';

type CardRow = { deck_id: string; status: 'pending' | 'kept'; card_states: { due: string } | { due: string }[] | null;
  source_chunks: { source_id: string } | null };

export default async function StudyPage() {
  await requireOnboardedUser();
  const db = await createClient();
  // ponytail: counts every card client-side; switch to a counting view if decks grow past a few thousand cards.
  const [decks, cards, sources] = await Promise.all([
    db.from('decks').select('id,title,exam_date').order('created_at'),
    db.from('cards').select('deck_id,status,card_states(due),source_chunks(source_id)').in('status', ['pending', 'kept']),
    db.from('sources').select('id,title'),
  ]);
  if (decks.error || cards.error || sources.error) throw new Error("We couldn't load your decks.");

  const now = Date.now();
  const sourceTitle = new Map(sources.data.map((s) => [s.id as string, s.title as string]));
  const summaries: DeckSummary[] = decks.data.map((d) => ({ id: d.id, title: d.title, exam_date: d.exam_date, kept: 0, due: 0, fresh: 0, triage: [] }));
  const byId = new Map(summaries.map((s) => [s.id, s]));
  for (const c of cards.data as unknown as CardRow[]) {
    const deck = byId.get(c.deck_id);
    if (!deck) continue;
    if (c.status === 'pending') {
      const sourceId = c.source_chunks?.source_id;
      if (!sourceId) continue;
      const t = deck.triage.find((x) => x.sourceId === sourceId);
      if (t) t.pending++;
      else deck.triage.push({ sourceId, title: sourceTitle.get(sourceId) ?? 'your material', pending: 1 });
      continue;
    }
    deck.kept++;
    const s = Array.isArray(c.card_states) ? c.card_states[0] : c.card_states;
    if (!s) deck.fresh++;
    else if (new Date(s.due).getTime() <= now) deck.due++;
  }

  return (
    <AppPage current="study" title="Study">
      {summaries.some((d) => d.kept > 0) && (
        <div className="mb-8 flex flex-wrap gap-3">
          {summaries.some((d) => d.due + d.fresh > 0) &&<Link href="/study/review" className="btn btn-primary">Review now</Link>}
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
