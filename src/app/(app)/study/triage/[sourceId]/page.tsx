import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import type { CardRow } from '@/lib/generate/generate-chunk';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { Triage, type KnownCard } from './triage';

const CARD_COLS = 'id,deck_id,source_chunk_id,type,front,back,key_points,source_quote,concept,bloom_level,importance,status,embedding';

export default async function TriagePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { userId } = await requireOnboardedUser();
  const { sourceId } = await params;
  if (!z.uuid().safeParse(sourceId).success) notFound();
  const supabase = await createClient();
  const { data: source, error } = await supabase.from('sources').select('id,title,deck_id').eq('id', sourceId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error("We couldn't load your material.");
  if (!source) notFound();

  const [chunks, deckCards] = await Promise.all([
    supabase.from('source_chunks').select('id,position,page_start,generated_at').eq('source_id', sourceId).order('position'),
    // ponytail: loads every kept/pending card in the deck for on-device dedupe; page it if decks grow past a few thousand cards.
    supabase.from('cards').select(CARD_COLS).eq('deck_id', source.deck_id).in('status', ['pending', 'kept']).order('created_at'),
  ]);
  if (chunks.error || deckCards.error) throw new Error("We couldn't load your material.");

  const pageOf = new Map(chunks.data.map((c) => [c.id as string, c.page_start as number | null]));
  const rows = deckCards.data as unknown as (Omit<CardRow, 'page_start'> & { embedding: number[] | null })[];
  const pending: CardRow[] = rows
    .filter((c) => c.status === 'pending' && c.source_chunk_id && pageOf.has(c.source_chunk_id))
    .map(({ embedding: _e, ...c }) => ({ ...c, page_start: pageOf.get(c.source_chunk_id!) ?? null }));
  const existing: KnownCard[] = rows.map((c) => ({ id: c.id, front: c.front, back: c.back, embedding: c.embedding }));
  const todo = chunks.data.filter((c) => !c.generated_at).map((c) => c.position as number);

  return (
    <AppPage current="study" title="Review your cards">
      <p className="mb-6 text-ink-muted [overflow-wrap:anywhere]">From {source.title}</p>
      <Triage sourceId={sourceId} deckId={source.deck_id} todo={todo} pending={pending} existing={existing} />
    </AppPage>
  );
}
