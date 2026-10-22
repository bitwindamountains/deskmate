import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { buildTest } from '@/review/practice-test';
import { TestRunner } from './test-runner';

export default async function PracticeTestPage({ params }: { params: Promise<{ deckId: string }> }) {
  await requireOnboardedUser();
  const { deckId } = await params;
  if (!z.uuid().safeParse(deckId).success) notFound();
  const db = await createClient();
  const [deck, cards] = await Promise.all([
    db.from('decks').select('title').eq('id', deckId).maybeSingle(),
    db.from('cards').select('id,front,back,type,key_points').eq('deck_id', deckId).eq('status', 'kept'),
  ]);
  if (deck.error || cards.error) throw new Error("We couldn't load this deck.");
  if (!deck.data) notFound();
  // A fresh shuffle on every visit; the seed keeps it stable within one render.
  const questions = buildTest(cards.data.map((c) => ({ id: c.id, front: c.front, back: c.back, type: c.type, keyPoints: c.key_points ?? [] })), Date.now());
  return (
    <AppPage current="study" title={`Practice test: ${deck.data.title}`}>
      <TestRunner deckId={deckId} deckTitle={deck.data.title} questions={questions} />
    </AppPage>
  );
}
