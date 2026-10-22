import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { CardList, type EditorCard } from './card-list';
import { DeckPrompts } from './deck-prompts';
import { Goals } from './goals';
import { Prereqs } from './prereqs';
import { conceptKey } from '@/review/prereqs';
import { Transfer } from './transfer';

type Row = Omit<EditorCard, 'lapses' | 'sourceId'> & { card_states: { lapses: number } | { lapses: number }[] | null;
  source_chunks: { source_id: string } | null };

export default async function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  await requireOnboardedUser();
  const { deckId } = await params;
  if (!z.uuid().safeParse(deckId).success) notFound();
  const db = await createClient();
  // ponytail: loads the whole deck for client-side search; page it if decks grow past a few thousand cards.
  const [deck, cards, edges] = await Promise.all([
    db.from('decks').select('id,title,exam_date,goals').eq('id', deckId).maybeSingle(),
    db.from('cards').select('id,type,front,back,concept,status,card_states(lapses),source_chunks(source_id)')
      .eq('deck_id', deckId).in('status', ['pending', 'kept', 'suspended']).order('created_at'),
    db.from('concept_prereqs').select('concept,prereq').eq('deck_id', deckId).order('created_at'),
  ]);
  if (deck.error || cards.error || edges.error) throw new Error("We couldn't load your cards.");
  if (!deck.data) notFound();

  const rows = (cards.data as unknown as Row[]).map(({ card_states, source_chunks, ...c }): EditorCard => {
    const s = Array.isArray(card_states) ? card_states[0] : card_states;
    return { ...c, lapses: s?.lapses ?? 0, sourceId: source_chunks?.source_id ?? null };
  });
  // One option per concept key, labelled with its most common spelling.
  const spellings = new Map<string, Map<string, number>>();
  for (const c of rows) {
    const label = c.concept.trim();
    if (!label) continue;
    const m = spellings.get(conceptKey(label)) ?? new Map<string, number>();
    spellings.set(conceptKey(label), m.set(label, (m.get(label) ?? 0) + 1));
  }
  const concepts = [...spellings].map(([key, m]) => ({ key, label: [...m].reduce((a, b) => (b[1] > a[1] ? b : a))[0] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <AppPage current="study" title={deck.data.title}>
      <p className="mb-6">
        <Link href={`/study/deck/${deckId}/exam`} className="underline">{deck.data.exam_date ? 'Change exam date' : 'Set exam date'}</Link>
        {' · '}<Link href={`/study/deck/${deckId}/test`} className="underline">Practice test</Link>
      </p>
      <DeckPrompts deckTitle={deck.data.title} cards={rows.filter((c) => c.status === 'kept')} />
      <CardList cards={rows} />
      <Prereqs deckId={deckId} concepts={concepts} edges={edges.data} />
      <Goals deckId={deckId} goals={deck.data.goals} cards={rows.map(({ id, front, back }) => ({ id, front, back }))} />
      <Transfer deckId={deckId} />
    </AppPage>
  );
}
