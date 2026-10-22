import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { CardList, type EditorCard } from './card-list';
import { DeckPrompts } from './deck-prompts';
import { Transfer } from './transfer';

type Row = Omit<EditorCard, 'lapses' | 'sourceId'> & { card_states: { lapses: number } | { lapses: number }[] | null;
  source_chunks: { source_id: string } | null };

export default async function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  await requireOnboardedUser();
  const { deckId } = await params;
  if (!z.uuid().safeParse(deckId).success) notFound();
  const db = await createClient();
  // ponytail: loads the whole deck for client-side search; page it if decks grow past a few thousand cards.
  const [deck, cards] = await Promise.all([
    db.from('decks').select('id,title,exam_date').eq('id', deckId).maybeSingle(),
    db.from('cards').select('id,type,front,back,concept,status,card_states(lapses),source_chunks(source_id)')
      .eq('deck_id', deckId).in('status', ['pending', 'kept', 'suspended']).order('created_at'),
  ]);
  if (deck.error || cards.error) throw new Error("We couldn't load your cards.");
  if (!deck.data) notFound();

  const rows = (cards.data as unknown as Row[]).map(({ card_states, source_chunks, ...c }): EditorCard => {
    const s = Array.isArray(card_states) ? card_states[0] : card_states;
    return { ...c, lapses: s?.lapses ?? 0, sourceId: source_chunks?.source_id ?? null };
  });
  return (
    <AppPage current="study" title={deck.data.title}>
      <p className="mb-6">
        <Link href={`/study/deck/${deckId}/exam`} className="underline">{deck.data.exam_date ? 'Change exam date' : 'Set exam date'}</Link>
        {' · '}<Link href={`/study/deck/${deckId}/test`} className="underline">Practice test</Link>
      </p>
      <DeckPrompts deckTitle={deck.data.title} cards={rows.filter((c) => c.status === 'kept')} />
      <CardList cards={rows} />
      <Transfer deckId={deckId} />
    </AppPage>
  );
}
