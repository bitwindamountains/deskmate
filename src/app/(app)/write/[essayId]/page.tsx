import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import type { ItemRow } from '@/lib/essay/analyze';
import { parseSelfAssessment } from '@/lib/essay/self-check';
import { paragraphs } from '@/lib/essay/text';
import { rubricOf } from '@/lib/essay/rubric';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { EssayView, type Analysis } from './essay-view';
import type { ThreadMessage } from './item-dialogue';
import type { OutlineLine } from './outline';
import { priorityCount } from '@/rank';
import { headStartCategories } from '@/growth/learner';
import { allRows } from '@/lib/cards/transfer';

// Same columns the analyze route returns, so the client can swap in its responses wholesale.
const ITEM_COLS = 'id,layer,category,rubric_criterion,paragraph_index,quote,anchor_start,anchor_end,severity,summary,hints,rewrite,replacements,convention,source,status,highest_level,carried_from_id,revised_summary';
const LOAD_FAILED = "We couldn't load your essay.";

export default async function EssayPage({ params }: { params: Promise<{ essayId: string }> }) {
  const { profile } = await requireOnboardedUser();
  const { essayId } = await params;
  if (!z.uuid().safeParse(essayId).success) notFound();
  const db = await createClient();
  const [essay, draft] = await Promise.all([
    db.from('essays').select('id,title,timed_minutes,rubric').eq('id', essayId).maybeSingle(),
    db.from('drafts').select('id,version,content,layers,outline,minutes_used').eq('essay_id', essayId).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (essay.error || draft.error) throw new Error(LOAD_FAILED);
  if (!essay.data || !draft.data) notFound();

  const draftId = draft.data.id as string;
  const [items, analysis, rewrites, self, recent, opened] = await Promise.all([
    db.from('feedback_items').select(ITEM_COLS).eq('draft_id', draftId).order('created_at'),
    db.from('analyses').select('rubric_scores,strengths,safety_concern,prompt_alignment').eq('draft_id', draftId).maybeSingle(),
    db.from('feedback_events').select('id,feedback_items!inner(draft_id)', { count: 'exact', head: true })
      .eq('action', 'rewrite').eq('feedback_items.draft_id', draftId),
    db.from('self_assessments').select('scores,weakness').eq('draft_id', draftId).maybeSingle(),
    // Spec J5: the student's last three answers to a priority, across essays; RLS scopes it to them.
    db.from('feedback_events').select('action').in('action', ['got_it', 'disagree']).order('created_at', { ascending: false }).limit(3),
    // Spec J7: original items (a carried copy repeats its parent's level) the student opened or resolved, paged past 1,000.
    allRows((from, to) => db.from('feedback_items').select('category,highest_level,drafts!inner(essay_id)')
      .or('highest_level.gte.1,status.in.(got_it,addressed)').is('carried_from_id', null).neq('source', 'languagetool')
      .order('id').range(from, to)),
  ]);
  if (items.error || analysis.error || rewrites.error || self.error) throw new Error(LOAD_FAILED);
  // Re-checked on read: a row written straight to the table must not break the page.
  const rubric = rubricOf(essay.data.rubric);
  const rubricMax = Object.fromEntries(rubric.map((c) => [c.name, c.maxScore]));
  const parsedSelf = self.data ? parseSelfAssessment(self.data, rubric) : null;
  const selfAssessment = parsedSelf?.ok ? parsedSelf.value : null;
  // A failed read of this nicety falls back to Top 3 rather than failing the page.
  const topCount = priorityCount(recent.data);
  const headStart = headStartCategories(((opened ?? []) as unknown as { category: string; highest_level: number; drafts: { essay_id: string } }[])
    .map((i) => ({ category: i.category, highest_level: i.highest_level, essay_id: i.drafts.essay_id })));
  const ids = items.data.map((i) => i.id as string);
  const messages = ids.length
    ? await db.from('feedback_messages').select('item_id,role,kind,text,verdict').in('item_id', ids).order('created_at')
    : { data: [], error: null };
  if (messages.error) throw new Error(LOAD_FAILED);
  const threads: Record<string, ThreadMessage[]> = {};
  for (const { item_id, ...m } of messages.data as (ThreadMessage & { item_id: string })[]) (threads[item_id] ??= []).push(m);

  return (
    <AppPage current="write" title={essay.data.title} wide>
      {/* Keyed on the draft: after a re-check refresh, a fresh view mounts and runs the new draft's layers. */}
      <EssayView key={draftId} essayId={essayId} draftId={draftId} version={draft.data.version as number} content={draft.data.content}
        paragraphs={paragraphs(draft.data.content)} layers={(draft.data.layers ?? {}) as Record<string, string>}
        items={items.data as unknown as ItemRow[]} analysis={analysis.data as Analysis | null} rewritesUsed={rewrites.count ?? 0}
        showScores={profile.preferences?.show_scores !== false} rubricMax={rubricMax} topCount={topCount} headStart={headStart}
        outline={draft.data.outline as OutlineLine[] | null} threads={threads}
        selfAssessment={selfAssessment}
        timed={essay.data.timed_minutes ? { limit: essay.data.timed_minutes as number, used: (draft.data.minutes_used as number | null) ?? null } : null} />
    </AppPage>
  );
}
