import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { ExamSetup } from './exam-setup';

export default async function ExamPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { profile } = await requireOnboardedUser();
  const { deckId } = await params;
  if (!z.uuid().safeParse(deckId).success) notFound();
  const { decks, cards } = await loadStudy(await createClient(), deckId);
  const deck = decks[0];
  if (!deck) notFound();
  return (
    <AppPage current="study" title={`${deck.title} exam`}>
      <ExamSetup deckId={deck.id} examDate={deck.exam_date} cards={cards} minutes={profile.study_minutes_per_day} />
    </AppPage>
  );
}
