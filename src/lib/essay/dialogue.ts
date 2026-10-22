import { logCalls, type Db } from '@/lib/llm-calls';
import { itemDialoguePrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { ItemDialogue } from '@/llm/schemas';
import { paragraphs } from './text';

type Kind = 'question' | 'dispute';
type Verdict = 'keep' | 'modify' | 'withdraw';
export type DialogueResult = { ok: true; reply: string; verdict: Verdict | null; revisedSummary: string | null }
  | { ok: false; status: 404 | 409 | 429 | 503; message: string };

type ItemWithDraft = { id: string; category: string; summary: string; quote: string | null; paragraph_index: number | null;
  drafts: { content: string; essays: { grade_level: string } } };

export const MAX_COACH_REPLIES = 4;
const MAX_WORDS = 120;
const NOT_FOUND = { ok: false, status: 404, message: "We couldn't find that feedback." } as const;
const AT_LIMIT = { ok: false, status: 409, message: "That's as far as I can take this one. Try the hint ladder, or mark it Got it." } as const;
const LIMIT = { ok: false, status: 429, message: "You've asked for a lot of help today. More unlocks at midnight UTC." } as const;
const BUSY = { ok: false, status: 503, message: 'The coach is busy right now. Try again in a minute.' } as const;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Cuts a reply to at most 120 words at the last full sentence; a single over-long sentence is cut by words. */
export function capReply(reply: string): string {
  const text = reply.trim();
  if (words(text) <= MAX_WORDS) return text;
  let out = '';
  for (const s of text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? []) {
    if (words(out + s) > MAX_WORDS) break;
    out += s;
  }
  return out.trim() || `${text.split(/\s+/).slice(0, MAX_WORDS).join(' ')}…`;
}

/** A question or a disagreement about one feedback item (A2.9, A3.10). One coach reply takes one of the day's helper calls. */
export async function sendDialogue(db: Db, userId: string, itemId: string, kind: Kind, message: string,
  env: Record<string, string | undefined>, completeFn: typeof complete = complete): Promise<DialogueResult> {
  const [found, thread] = await Promise.all([
    db.from('feedback_items').select('id,category,summary,quote,paragraph_index,drafts(content,essays(grade_level))').eq('id', itemId).maybeSingle(),
    db.from('feedback_messages').select('role,text').eq('item_id', itemId).order('created_at'),
  ]);
  if (found.error || thread.error) return BUSY;
  if (!found.data) return NOT_FOUND;
  const item = found.data as unknown as ItemWithDraft;
  const history = thread.data as { role: 'student' | 'coach'; text: string }[];
  if (history.filter((m) => m.role === 'coach').length >= MAX_COACH_REPLIES) return AT_LIMIT;

  const { data: allowed, error: qErr } = await db.rpc('consume_hint_quota');
  if (qErr) return BUSY;
  if (!allowed) return LIMIT;

  const paras = paragraphs(item.drafts.content);
  let r: ItemDialogue;
  try {
    const res = await completeFn('item_dialogue', itemDialoguePrompt({ gradeLevel: item.drafts.essays.grade_level,
      item: { summary: item.summary, quote: item.quote, category: item.category },
      paragraph: item.paragraph_index !== null ? paras[item.paragraph_index] ?? item.drafts.content : item.drafts.content,
      history, kind, message }), ItemDialogue, { env });
    await logCalls(db, userId, res.log);
    r = res.data;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }

  const reply = capReply(r.reply);
  // A question never changes the item; "modify" without a new summary is just a "keep".
  const revised = kind === 'dispute' && r.verdict === 'modify' && r.revised_summary?.trim() ? r.revised_summary.trim().slice(0, 1000) : null;
  const verdict: Verdict | null = kind === 'question' ? null : r.verdict === 'modify' && !revised ? 'keep' : r.verdict ?? 'keep';

  // One insert shares one now(); explicit times keep the student's message before the reply when the thread is ordered.
  const at = Date.now();
  const { error: msgErr } = await db.from('feedback_messages').insert([
    { user_id: userId, item_id: itemId, role: 'student', kind, text: message, created_at: new Date(at).toISOString() },
    { user_id: userId, item_id: itemId, role: 'coach', kind, text: reply, verdict, created_at: new Date(at + 1).toISOString() },
  ]);
  if (msgErr) return BUSY;

  if (kind === 'dispute') {
    if (revised) {
      const { error } = await db.rpc('revise_item', { p_item_id: itemId, p_summary: revised });
      if (error) return BUSY;
    }
    const { error } = await db.from('feedback_items')
      .update({ status: verdict === 'withdraw' ? 'withdrawn' : 'disputed', dispute_reason: message }).eq('id', itemId).eq('user_id', userId);
    if (error) return BUSY;
    await db.from('feedback_events').insert({ user_id: userId, item_id: itemId, action: 'disagree' }); // analytics only; best effort
  }
  return { ok: true, reply, verdict, revisedSummary: revised };
}
