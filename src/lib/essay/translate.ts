import { logCalls, type Db } from '@/lib/llm-calls';
import { translateFeedbackPrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { TranslatedFeedback } from '@/llm/schemas';

export type Lang = 'fil' | 'es';
export type TranslateResult = { ok: true; summary: string; hints: string[]; cached: boolean }
  | { ok: false; status: 404 | 429 | 503; message: string };

const NOT_FOUND = { ok: false, status: 404, message: "We couldn't find that feedback." } as const;
const LIMIT = { ok: false, status: 429, message: "You've asked for a lot of help today. More unlocks at midnight UTC." } as const;
const BUSY = { ok: false, status: 503, message: "Couldn't translate this right now. Try again in a minute." } as const;

/**
 * A3.9: the summary and the hints revealed so far, in the student's first language. Cached per item, language and
 * revealed level, so revealing another hint makes a new entry. Hint 5 (the rewrite) is essay text and stays English.
 */
export async function translateItem(db: Db, userId: string, itemId: string, lang: Lang, env: Record<string, string | undefined>,
  completeFn: typeof complete = complete): Promise<TranslateResult> {
  const { data: item, error } = await db.from('feedback_items').select('summary,revised_summary,hints,highest_level').eq('id', itemId).maybeSingle();
  if (error) return BUSY;
  if (!item) return NOT_FOUND;
  const level = item.highest_level as number;

  const { data: hit, error: hitErr } = await db.from('item_translations').select('result')
    .eq('item_id', itemId).eq('lang', lang).eq('level', level).maybeSingle();
  if (hitErr) return BUSY;
  if (hit) {
    const r = hit.result as TranslatedFeedback;
    return { ok: true, summary: r.summary, hints: r.hints, cached: true };
  }

  const { data: allowed, error: qErr } = await db.rpc('consume_hint_quota');
  if (qErr) return BUSY;
  if (!allowed) return LIMIT;

  const hints = (item.hints as string[]).slice(0, Math.min(level, 4)).filter(Boolean);
  let r: TranslatedFeedback;
  try {
    const res = await completeFn('translate_feedback',
      translateFeedbackPrompt({ lang, summary: (item.revised_summary as string | null) ?? (item.summary as string), hints }), TranslatedFeedback, { env });
    await logCalls(db, userId, res.log);
    r = { summary: res.data.summary, hints: res.data.hints.slice(0, hints.length) };
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }
  // Best effort: a lost cache row costs one more call later. A duplicate from a concurrent request is ignored.
  await db.from('item_translations').insert({ item_id: itemId, user_id: userId, lang, level, result: r });
  return { ok: true, ...r, cached: false };
}
