import { z } from 'zod';
import { isGrounded } from '@/grounding';
import { logCalls, type Db } from '@/lib/llm-calls';
import { resetsIn } from '@/lib/time/reset';
import { feynmanPrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { Feynman } from '@/llm/schemas';
import { conceptKey } from '@/review/prereqs';

export type FeynmanFeedback = { covered: string[]; missed: string[]; misconception: string | null; added: number; dropped: number };
export type FeynmanResult = { ok: true; feedback: FeynmanFeedback } | { ok: false; status: 400 | 404 | 429 | 503; message: string };

export const MIN_WORDS = 20, MAX_WORDS = 600;
const Input = z.object({ deckId: z.uuid(), concept: z.string().trim().min(1).max(120), explanation: z.string().trim().max(5000) });
const NOT_FOUND = { ok: false, status: 404, message: "We couldn't find cards for that concept." } as const;
const LIMIT = () => ({ ok: false, status: 429, message: `You've asked for a lot of help today. More unlocks ${resetsIn()}.` }) as const;
const BUSY = { ok: false, status: 503, message: 'Feedback is busy right now. Try again in a minute.' } as const;
const PASSAGES_MAX = 4000; // characters of source text sent as context

type CardRow = { id: string; deck_id: string; front: string; back: string; key_points: string[] | null; concept: string; importance: number;
  source_chunk_id: string | null; source_chunks: { text: string } | null };

/**
 * B3.7 Feynman mode: the student explains a concept in their own words; one call judges it only against that concept's
 * cards and source passages. Missed points can become pending cards, each grounded in a passage. One helper call.
 */
export async function requestFeynman(db: Db, userId: string, input: unknown, env: Record<string, string | undefined>,
  completeFn: typeof complete = complete): Promise<FeynmanResult> {
  const v = Input.safeParse(input);
  const words = v.success ? v.data.explanation.split(/\s+/).filter(Boolean).length : 0;
  if (!v.success || words < MIN_WORDS || words > MAX_WORDS) {
    return { ok: false, status: 400, message: `Explain it in ${MIN_WORDS} to ${MAX_WORDS} words.` };
  }
  const { data, error } = await db.from('cards').select('id,deck_id,front,back,key_points,concept,importance,source_chunk_id,source_chunks(text)')
    .eq('deck_id', v.data.deckId).eq('status', 'kept').limit(500);
  if (error) return BUSY;
  const cards = ((data ?? []) as unknown as CardRow[]).filter((c) => conceptKey(c.concept) === conceptKey(v.data.concept)).slice(0, 12);
  if (!cards.length) return NOT_FOUND;

  const { data: allowed, error: qErr } = await db.rpc('consume_hint_quota');
  if (qErr) return BUSY;
  if (!allowed) return LIMIT();

  // Each distinct passage once, in card order, up to the budget.
  const chunks = new Map<string, string>();
  let budget = PASSAGES_MAX;
  for (const c of cards) {
    const text = c.source_chunks?.text;
    if (!c.source_chunk_id || !text || chunks.has(c.source_chunk_id) || budget <= 0) continue;
    chunks.set(c.source_chunk_id, text.slice(0, budget));
    budget -= text.length;
  }
  let r: Feynman;
  try {
    const out = await completeFn('feynman', feynmanPrompt({ concept: cards[0].concept,
      reference: cards.map((c) => ({ question: c.front, answer: c.back, keyPoints: c.key_points ?? [] })),
      passages: [...chunks.values()], explanation: v.data.explanation }), Feynman, { env });
    await logCalls(db, userId, out.log);
    r = out.data;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }

  // Grounding (B2.2): a new card is saved only if its quote is in one of the passages, and it keeps that passage as its source.
  const rows = r.cards.flatMap((card) => {
    const chunkId = [...chunks].find(([, text]) => isGrounded(text, card.source_quote))?.[0];
    // The explained concept, so the new cards join it on the mastery map whatever label the model wrote.
    return chunkId ? [{ ...card, concept: cards[0].concept, user_id: userId, deck_id: cards[0].deck_id, source_chunk_id: chunkId, importance: 2, status: 'pending' }] : [];
  });
  // The feedback is already paid for (a helper call), so a failed save drops only the cards, never the feedback.
  const added = rows.length && !(await db.from('cards').insert(rows)).error ? rows.length : 0;
  return { ok: true, feedback: { covered: r.covered, missed: r.missed, misconception: r.misconception, added, dropped: r.cards.length - added } };
}
