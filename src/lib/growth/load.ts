import { patternOf, type PatternKey } from '@/growth/patterns';
import type { EssayItems } from '@/growth/profile';
import type { Db } from '@/lib/llm-calls';

type Row = { id: string; word_count: number; created_at: string; essays: { id: string; title: string };
  feedback_items: { layer: string; category: string; summary: string; rubric_criterion: string | null; source: string; status: string }[] };

/** First drafts only (later drafts are revisions of the same habits), oldest first, read through RLS. */
export async function loadGrowth(db: Db): Promise<EssayItems[]> {
  const { data, error } = await db.from('drafts')
    .select('id,word_count,created_at,essays!inner(id,title),feedback_items(layer,category,summary,rubric_criterion,source,status)')
    .eq('version', 1).order('created_at');
  if (error) throw new Error("We couldn't load your writing patterns.");
  return (data as unknown as Row[]).map((d) => ({
    essayId: d.essays.id, title: d.essays.title, createdAt: d.created_at, words: d.word_count,
    // The coach took back a withdrawn item, so it says nothing about the student's habits.
    patterns: d.feedback_items.filter((i) => i.status !== 'withdrawn').flatMap((i) => patternOf(i) ?? []) as PatternKey[],
  }));
}
