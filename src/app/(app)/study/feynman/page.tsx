import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { conceptKey } from '@/review/prereqs';
import { FeynmanForm } from './feynman-form';
import { allRows } from '@/lib/cards/transfer';

/** ?deck=&concept= (from the mastery map): B3.7 Feynman mode for one concept of one deck. */
export default async function FeynmanPage({ searchParams }: { searchParams: Promise<{ deck?: string; concept?: string }> }) {
  await requireOnboardedUser();
  const { deck, concept } = await searchParams;
  if (!z.uuid().safeParse(deck).success || typeof concept !== 'string' || !concept.trim()) notFound();
  const db = await createClient();
  // Paged, so a concept in a deck past 1,000 cards is still found (the mastery map links here for every concept).
  const data = await allRows<{ concept: string }>((from, to) => db.from('cards').select('concept')
    .eq('deck_id', deck!).eq('status', 'kept').order('id').range(from, to));
  if (!data) throw new Error("We couldn't load that concept.");
  const match = data.find((c) => conceptKey(c.concept) === conceptKey(concept));
  if (!match) notFound();
  const label = match.concept.trim();
  return (
    <AppPage current="study" title={`Explain: ${label}`}>
      <FeynmanForm deckId={deck!} concept={conceptKey(concept)} label={label} />
    </AppPage>
  );
}
