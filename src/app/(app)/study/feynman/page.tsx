import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { conceptKey } from '@/review/prereqs';
import { FeynmanForm } from './feynman-form';

/** ?deck=&concept= (from the mastery map): B3.7 Feynman mode for one concept of one deck. */
export default async function FeynmanPage({ searchParams }: { searchParams: Promise<{ deck?: string; concept?: string }> }) {
  await requireOnboardedUser();
  const { deck, concept } = await searchParams;
  if (!z.uuid().safeParse(deck).success || typeof concept !== 'string' || !concept.trim()) notFound();
  const db = await createClient();
  const { data, error } = await db.from('cards').select('concept').eq('deck_id', deck!).eq('status', 'kept').limit(500);
  if (error) throw new Error("We couldn't load that concept.");
  const match = (data ?? []).find((c) => conceptKey(c.concept as string) === conceptKey(concept));
  if (!match) notFound();
  const label = (match.concept as string).trim();
  return (
    <AppPage current="study" title={`Explain: ${label}`}>
      <FeynmanForm deckId={deck!} concept={conceptKey(concept)} label={label} />
    </AppPage>
  );
}
