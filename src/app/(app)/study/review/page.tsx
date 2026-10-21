import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import type { StateRow } from '@/review/schedule';
import { ReviewSession, type ReviewCard } from './session';

type Row = { id: string; deck_id: string; type: ReviewCard['type']; importance: ReviewCard['importance']; front: string; back: string;
  key_points: string[] | null; card_states: (StateRow & { user_id?: string }) | StateRow[] | null; decks: { exam_date: string | null } | null };

export default async function ReviewPage() {
  const { profile } = await requireOnboardedUser();
  const supabase = await createClient();
  // ponytail: "today" is the UTC day on the server; move to the user's time zone when profiles store one.
  const today = new Date(new Date().toISOString().slice(0, 10)).toISOString();

  // ponytail: loads every kept card; page or filter by due date once decks grow past a few thousand cards.
  const [cards, todays] = await Promise.all([
    supabase.from('cards').select('id,deck_id,type,importance,front,back,key_points,card_states(*),decks(exam_date)').eq('status', 'kept'),
    supabase.from('reviews').select('card_id').gte('reviewed_at', today),
  ]);
  if (cards.error || todays.error) throw new Error("We couldn't load your cards.");

  // A card is new today when its first review is today.
  const reviewedToday = [...new Set(todays.data.map((r) => r.card_id as string))];
  let newIntroducedToday = 0;
  if (reviewedToday.length) {
    const before = await supabase.from('reviews').select('card_id').in('card_id', reviewedToday).lt('reviewed_at', today);
    if (before.error) throw new Error("We couldn't load your cards.");
    newIntroducedToday = reviewedToday.length - new Set(before.data.map((r) => r.card_id as string)).size;
  }

  const rows = cards.data as unknown as Row[];
  const examDates: Record<string, string | null> = {};
  const studyCards: ReviewCard[] = rows.map((r) => {
    examDates[r.deck_id] = r.decks?.exam_date ?? null;
    const s = Array.isArray(r.card_states) ? r.card_states[0] ?? null : r.card_states;
    // toISOString: the client compares timestamps as strings against its own toISOString() values
    const state: StateRow | null = s && {
      card_id: s.card_id, due: new Date(s.due).toISOString(), stability: s.stability, difficulty: s.difficulty,
      scheduled_days: s.scheduled_days, learning_steps: s.learning_steps, reps: s.reps, lapses: s.lapses, state: s.state,
      last_review: s.last_review ? new Date(s.last_review).toISOString() : null,
    };
    return { id: r.id, deckId: r.deck_id, type: r.type, importance: r.importance, front: r.front, back: r.back, keyPoints: r.key_points ?? [], state };
  });

  return (
    <AppPage current="study" title="Review">
      <ReviewSession cards={studyCards} minutes={profile.study_minutes_per_day} newIntroducedToday={newIntroducedToday} examDates={examDates} />
    </AppPage>
  );
}
