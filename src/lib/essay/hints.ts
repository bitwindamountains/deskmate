import { wordCount } from '@/chunk';
import { logCalls, type Db } from '@/lib/llm-calls';
import { hintLadderPrompt, hintRewritePrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { HintLadder, HintRewrite } from '@/llm/schemas';
import { paragraphs } from './text';

export type HintResult = { ok: true; text: string } | { ok: false; status: 404 | 409 | 429 | 503; message: string };

type ItemWithDraft = { id: string; draft_id: string; category: string; summary: string; quote: string | null; paragraph_index: number | null;
  hints: string[]; rewrite: string | null; highest_level: number; drafts: { content: string; essays: { grade_level: string } } };

const NOT_FOUND = { ok: false, status: 404, message: "We couldn't find that feedback." } as const;
const WHOLE_ESSAY = { ok: false, status: 409, message: "This item covers the whole essay, so there's no single sentence to rewrite." } as const;
const CAP = { ok: false, status: 429, message: "You've used this draft's 3 suggested rewrites." } as const;
const NO_REWRITE = { ok: false, status: 503, message: "Couldn't make a suggestion for this one." } as const;
const BUSY = { ok: false, status: 503, message: 'Hints are busy right now. Try again in a minute.' } as const;

// No ghostwriting (brief E2): a rewrite may not outgrow the words it replaces.
const rewriteCap = (quote: string) => Math.max(25, Math.floor(1.5 * wordCount(quote)));

export async function requestHint(db: Db, userId: string, itemId: string, level: 3 | 4 | 5,
  env: Record<string, string | undefined>, completeFn: typeof complete = complete): Promise<HintResult> {
  const { data, error } = await db.from('feedback_items')
    .select('id,draft_id,category,summary,quote,paragraph_index,hints,rewrite,highest_level,drafts(content,essays(grade_level))')
    .eq('id', itemId).maybeSingle();
  if (error) return BUSY;
  if (!data) return NOT_FOUND;
  const item = data as unknown as ItemWithDraft;
  if (level === 5 && !item.quote) return WHOLE_ESSAY;

  const paras = paragraphs(item.drafts.content);
  const input = { gradeLevel: item.drafts.essays.grade_level, item: { summary: item.summary, quote: item.quote, category: item.category },
    paragraph: item.paragraph_index !== null ? paras[item.paragraph_index] ?? item.drafts.content : item.drafts.content };

  let text: string;
  try {
    if (level < 5) {
      text = item.hints[level - 1];
      if (!text) {
        const r = await completeFn('hint_ladder', hintLadderPrompt(input), HintLadder, { env });
        await logCalls(db, userId, r.log);
        const { data: saved, error: saveErr } = await db.rpc('save_hint_levels', { p_item_id: itemId, p_explanation: r.data.explanation, p_example: r.data.example });
        if (saveErr) return BUSY;
        if (saved) text = level === 3 ? r.data.explanation : r.data.example;
        else { // another request saved them first; show what is stored so both agree
          const again = await db.from('feedback_items').select('hints').eq('id', itemId).single();
          if (again.error) return BUSY;
          text = (again.data.hints as string[])[level - 1];
        }
      }
    } else if (item.rewrite) {
      text = item.rewrite;
    } else {
      // Reserve before calling: the cap must hold even when the call fails (the slot stays used, see plan Task 6).
      const { data: reserved, error: resErr } = await db.rpc('reserve_rewrite', { p_item_id: itemId });
      if (resErr) return BUSY;
      if (!reserved) return CAP;
      const r = await completeFn('hint_rewrite', hintRewritePrompt(input), HintRewrite, { env });
      await logCalls(db, userId, r.log);
      if (wordCount(r.data.rewrite) > rewriteCap(item.quote!)) return NO_REWRITE;
      const { error: saveErr } = await db.rpc('save_rewrite', { p_item_id: itemId, p_rewrite: r.data.rewrite });
      if (saveErr) return BUSY;
      text = r.data.rewrite;
    }
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }

  // Hint-level reliance is the growth signal (spec §8.1); a failed write must not cost the student the hint.
  await Promise.all([
    db.from('feedback_events').insert({ user_id: userId, item_id: itemId, action: 'viewed_level', level }),
    level > item.highest_level ? db.from('feedback_items').update({ highest_level: level }).eq('id', itemId) : null,
  ]);
  return { ok: true, text };
}
