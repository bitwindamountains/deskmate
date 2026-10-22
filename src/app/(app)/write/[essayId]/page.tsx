import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import type { ItemRow } from '@/lib/essay/analyze';
import { paragraphs } from '@/lib/essay/text';
import { DEFAULT_RUBRIC } from '@/llm/prompts';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { EssayView, type Analysis } from './essay-view';
import type { ThreadMessage } from './item-dialogue';
import type { OutlineLine } from './outline';

// Same columns the analyze route returns, so the client can swap in its responses wholesale.
const ITEM_COLS = 'id,layer,category,rubric_criterion,paragraph_index,quote,anchor_start,anchor_end,severity,summary,hints,rewrite,replacements,convention,source,status,highest_level,carried_from_id,revised_summary';
const LOAD_FAILED = "We couldn't load your essay.";
const rubricMax = Object.fromEntries(DEFAULT_RUBRIC.map((c) => [c.name, c.maxScore]));

export default async function EssayPage({ params }: { params: Promise<{ essayId: string }> }) {
  const { profile } = await requireOnboardedUser();
  const { essayId } = await params;
  if (!z.uuid().safeParse(essayId).success) notFound();
  const db = await createClient();
  const [essay, draft] = await Promise.all([
    db.from('essays').select('id,title').eq('id', essayId).maybeSingle(),
    db.from('drafts').select('id,version,content,layers,outline').eq('essay_id', essayId).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (essay.error || draft.error) throw new Error(LOAD_FAILED);
  if (!essay.data || !draft.data) notFound();

  const draftId = draft.data.id as string;
  const [items, analysis, rewrites] = await Promise.all([
    db.from('feedback_items').select(ITEM_COLS).eq('draft_id', draftId).order('created_at'),
    db.from('analyses').select('rubric_scores,strengths,safety_concern,prompt_alignment').eq('draft_id', draftId).maybeSingle(),
    db.from('feedback_events').select('id,feedback_items!inner(draft_id)', { count: 'exact', head: true })
      .eq('action', 'rewrite').eq('feedback_items.draft_id', draftId),
  ]);
  if (items.error || analysis.error || rewrites.error) throw new Error(LOAD_FAILED);
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
        showScores={profile.preferences?.show_scores !== false} rubricMax={rubricMax}
        outline={draft.data.outline as OutlineLine[] | null} threads={threads} />
    </AppPage>
  );
}
