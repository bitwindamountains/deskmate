import { logCalls, type Db } from '@/lib/llm-calls';
import { essayGlobalPrompt, essayParagraphsPrompt, type EssayInput } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { EssayGlobal, EssayParagraphs, type FeedbackItem } from '@/llm/schemas';

import { applyJudgement, planCarryOver, type CarryPlan, type PrevItem } from './carry';
import { checkSentences } from './languagetool';
import { anchorQuote, paragraphs } from './text';

export type Layer = 'global' | 'paragraphs' | 'sentences';
export type ItemRow = { id: string; layer: 'global' | 'paragraph' | 'sentence'; category: string; rubric_criterion: string | null;
  paragraph_index: number | null; quote: string | null; anchor_start: number | null; anchor_end: number | null;
  severity: 'low' | 'medium' | 'high'; summary: string; hints: string[]; rewrite: string | null; replacements: string[];
  convention: boolean; source: 'llm' | 'languagetool'; status: string; highest_level: number; carried_from_id: string | null;
  revised_summary: string | null };
type Analysis = { rubric_scores: unknown; strengths: unknown; safety_concern: boolean; prompt_alignment: unknown };
/** items is every item of the draft after this layer, so the client can replace its state wholesale. */
export type AnalyzeResult =
  | { ok: true; items: ItemRow[]; analysis?: Analysis; outline?: unknown; dropped: number; already: boolean }
  | { ok: false; status: 404 | 409 | 429 | 503; error: 'not_found' | 'running' | 'quota' | 'busy'; message: string };

const ITEM_COLS = 'id,layer,category,rubric_criterion,paragraph_index,quote,anchor_start,anchor_end,severity,summary,hints,rewrite,replacements,convention,source,status,highest_level,carried_from_id,revised_summary';
const NOT_FOUND = { ok: false, status: 404, error: 'not_found', message: "We couldn't find that essay." } as const;
const RUNNING = { ok: false, status: 409, error: 'running', message: 'This feedback is already on its way.' } as const;
const QUOTA = { ok: false, status: 429, error: 'quota', message: "You've used today's 5 essay checks. They reset at midnight UTC." } as const;
const BUSY = { ok: false, status: 503, error: 'busy', message: 'Feedback is busy right now. Your essay is saved; try again in a minute.' } as const;
const ITEM_LAYER = { global: 'global', paragraphs: 'paragraph', sentences: 'sentence' } as const;

type Draft = { id: string; essay_id: string; version: number; content: string; paragraph_hashes: string[]; layers: Record<string, string>;
  essays: { essay_type: string; grade_level: string; assignment_prompt: string | null } };
type Row = Omit<ItemRow, 'id' | 'status' | 'highest_level' | 'carried_from_id' | 'rewrite' | 'revised_summary'>
  & Partial<Pick<ItemRow, 'status' | 'carried_from_id' | 'rewrite' | 'highest_level' | 'revised_summary'>>;

class Failed extends Error {}
type OutlineLine = { paragraph_index: number; summary: string; flag?: EssayParagraphs['outline'][number]['flag'] | null };

const MAX_TEXT = 1000; // feedback_items.summary and .quote checks
const clamp = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s);

/** Anchors model items to the essay; items whose quote is not in the essay are dropped (never saved with a guessed anchor). */
function anchorItems(paras: string[], items: FeedbackItem[], layer: ItemRow['layer']): { rows: Row[]; dropped: number } {
  const rows: Row[] = [];
  for (const it of items) {
    const a = it.quote.length <= MAX_TEXT ? anchorQuote(paras, it.paragraph_index, it.quote) : null;
    if (!a) continue;
    // Clamp to the column limits: one over-long model field must not fail the whole insert.
    rows.push({ layer, category: it.category.slice(0, 60), rubric_criterion: it.rubric_criterion.slice(0, 60) || null,
      paragraph_index: a.paragraph_index, quote: it.quote, anchor_start: a.start, anchor_end: a.end, severity: it.severity,
      summary: clamp(it.summary), hints: it.hints.map(clamp), replacements: [], convention: false, source: 'llm' });
  }
  return { rows, dropped: items.length - rows.length };
}

/** A copy of an earlier draft's item, re-anchored in this draft (anchor null when its words are gone). */
function carryRow(paras: string[], old: ItemRow, paragraphIndex: number | null, status: string): Row {
  const { id, ...rest } = old; // no id key at all: supabase-js would send id = null for a key set to undefined
  const a = rest.quote ? anchorQuote(paras, paragraphIndex ?? rest.paragraph_index ?? 0, rest.quote) : null;
  return { ...rest, paragraph_index: a?.paragraph_index ?? paragraphIndex, anchor_start: a?.start ?? null,
    anchor_end: a?.end ?? null, status, carried_from_id: id };
}

export async function analyzeLayer(db: Db, userId: string, draftId: string, layer: Layer,
  env: Record<string, string | undefined>, deps: { completeFn?: typeof complete; fetchFn?: typeof fetch } = {}): Promise<AnalyzeResult> {
  const completeFn = deps.completeFn ?? complete;
  const { data, error } = await db.from('drafts')
    .select('id,essay_id,version,content,paragraph_hashes,layers,essays(essay_type,grade_level,assignment_prompt)').eq('id', draftId).maybeSingle();
  if (error) return BUSY;
  if (!data) return NOT_FOUND;
  const draft = data as unknown as Draft;

  const current = async (dropped: number, already: boolean): Promise<AnalyzeResult> => {
    const [items, analysis, outline] = await Promise.all([
      db.from('feedback_items').select(ITEM_COLS).eq('draft_id', draftId).order('created_at'),
      db.from('analyses').select('rubric_scores,strengths,safety_concern,prompt_alignment').eq('draft_id', draftId).maybeSingle(),
      db.from('drafts').select('outline').eq('id', draftId).single(),
    ]);
    if (items.error || analysis.error || outline.error) return BUSY;
    return { ok: true, items: items.data as ItemRow[], analysis: (analysis.data as Analysis | null) ?? undefined,
      outline: outline.data.outline ?? undefined, dropped, already };
  };
  if (draft.layers[layer] === 'done') return current(0, true);

  const { data: claimed, error: claimErr } = await db.rpc('claim_layer', { p_draft_id: draftId, p_layer: layer });
  if (claimErr) return claimErr.code === '42501' ? NOT_FOUND : BUSY;
  if (!claimed) return RUNNING;
  // Only this request holds the layer now; every exit below releases it as done or failed.
  const finish = (status: 'done' | 'failed') => db.rpc('finish_layer', { p_draft_id: draftId, p_layer: layer, p_status: status });

  const { data: allowed, error: quotaErr } = await db.rpc('consume_essay_quota', { p_draft_id: draftId });
  if (quotaErr || !allowed) {
    await finish('failed');
    return quotaErr ? BUSY : QUOTA;
  }

  try {
    const dropped = await runLayer(db, userId, draft, layer, env, completeFn, deps.fetchFn);
    const { error: doneErr } = await finish('done');
    if (doneErr) throw new Failed();
    return current(dropped, false);
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    await finish('failed');
    return BUSY;
  }
}

async function runLayer(db: Db, userId: string, draft: Draft, layer: Layer, env: Record<string, string | undefined>,
  completeFn: typeof complete, fetchFn: typeof fetch | undefined): Promise<number> {
  const paras = paragraphs(draft.content);
  const insert = async (rows: Row[]) => {
    if (!rows.length) return;
    // Same keys on every row: in a batch, supabase-js sends null (not the column default) for a key some rows lack.
    const { error } = await db.from('feedback_items').insert(rows.map((r) =>
      ({ status: 'open', highest_level: 0, carried_from_id: null, rewrite: null, revised_summary: null, ...r, user_id: userId, draft_id: draft.id })));
    if (error) throw new Failed();
  };

  // Re-check: plan which earlier items carry over and which paragraphs changed (spec §8.1, A2.8).
  let plan: CarryPlan | null = null;
  let prevItems: ItemRow[] = [];
  let prevOutline: OutlineLine[] = [];
  let prevHashes: string[] = [];
  if (draft.version > 1) {
    const prev = await db.from('drafts').select('id,paragraph_hashes,outline').eq('essay_id', draft.essay_id).eq('version', draft.version - 1).maybeSingle();
    if (prev.error) throw new Failed();
    if (prev.data) {
      prevOutline = (prev.data.outline as OutlineLine[] | null) ?? [];
      prevHashes = prev.data.paragraph_hashes as string[];
      const items = await db.from('feedback_items').select(ITEM_COLS).eq('draft_id', prev.data.id);
      if (items.error) throw new Failed();
      prevItems = items.data as ItemRow[];
      plan = planCarryOver(prev.data.paragraph_hashes as string[], draft.paragraph_hashes, prevItems as PrevItem[]);
    }
  }
  const byId = new Map(prevItems.map((i) => [i.id, i]));
  const keepFor = (itemLayer: ItemRow['layer']) =>
    (plan?.keep ?? []).flatMap((k) => (byId.get(k.id)?.layer === itemLayer ? [carryRow(paras, byId.get(k.id)!, k.paragraph_index, byId.get(k.id)!.status)] : []));
  const input: EssayInput = { essay: draft.content, gradeLevel: draft.essays.grade_level, essayType: draft.essays.essay_type,
    assignmentPrompt: draft.essays.assignment_prompt ?? undefined };

  if (layer === 'global') {
    const judge = plan?.judge ?? [];
    const r = await completeFn('essay_global', essayGlobalPrompt({ ...input, previousItems: judge.length ? judge.map((i) => ({ id: i.id, summary: i.summary, quote: i.quote })) : undefined }), EssayGlobal, { env });
    await logCalls(db, userId, r.log);
    const { rows, dropped } = anchorItems(paras, r.data.items, 'global');
    const strengths = r.data.strengths.flatMap((s) => {
      const a = anchorQuote(paras, s.paragraph_index, s.quote);
      return a ? [{ paragraph_index: a.paragraph_index, quote: s.quote, why: s.why, start: a.start, end: a.end }] : [];
    });
    const carried: Row[] = [];
    if (plan) {
      for (const j of applyJudgement(plan, r.data.carried)) {
        const old = byId.get(j.id)!;
        // A student's own "Got it" or dispute stands unless the draft now addresses the item.
        const status = j.status === 'addressed' || old.status === 'open' || old.status === 'partial' ? j.status : old.status;
        if (status !== old.status) {
          const { error: upErr } = await db.from('feedback_items').update({ status }).eq('id', old.id);
          if (upErr) throw new Failed();
        }
        if (status !== 'addressed') carried.push(carryRow(paras, old, null, status));
      }
    }
    await insert([...rows, ...carried]);
    // Last, and insert-or-ignore: a row left by an earlier failed attempt must not lock this layer on every retry.
    const { error } = await db.from('analyses').upsert({ draft_id: draft.id, user_id: userId, rubric_scores: r.data.rubric_scores,
      strengths, safety_concern: r.data.safety_concern, prompt_alignment: input.assignmentPrompt ? r.data.prompt_alignment ?? null : null },
    { onConflict: 'draft_id', ignoreDuplicates: true });
    if (error) throw new Failed();
    return dropped + r.data.strengths.length - strengths.length;
  }

  // Carried rows go in with the new ones, in one insert after the external call succeeds,
  // so a failed call followed by "Try again" never saves them twice.
  if (layer === 'paragraphs') {
    const kept = keepFor('paragraph');
    // Outline (A3.2): unchanged paragraphs keep their earlier line (matched by hash), reported ones take the new line.
    const saveOutline = async (fresh: OutlineLine[]) => {
      const lines = paras.flatMap((_, i) => {
        const old = plan && !plan.changed.includes(i) ? prevOutline.find((l) => l.paragraph_index === prevHashes.indexOf(draft.paragraph_hashes[i])) : undefined;
        const line = old ?? fresh.find((l) => l.paragraph_index === i && (!plan || plan.changed.includes(i)));
        return line ? [{ paragraph_index: i, summary: line.summary.slice(0, 200), flag: line.flag ?? null }] : [];
      });
      if (!lines.length) return;
      const { error } = await db.rpc('set_outline', { p_draft_id: draft.id, p_outline: lines });
      if (error) throw new Failed();
    };
    // Outline first: set_outline writes only once, so a retry after a failed items insert is harmless (and not the reverse).
    if (plan && !plan.changed.length) { await saveOutline([]); await insert(kept); return 0; }
    const r = await completeFn('essay_paragraphs', essayParagraphsPrompt({ ...input, onlyParagraphs: plan?.changed }), EssayParagraphs, { env });
    await logCalls(db, userId, r.log);
    const { rows, dropped } = anchorItems(paras, r.data.items, 'paragraph');
    await saveOutline(r.data.outline);
    await insert([...kept, ...rows]);
    return dropped;
  }

  const kept = keepFor('sentence');
  const indices = plan ? plan.changed : paras.map((_, i) => i);
  const found = await checkSentences(paras, indices, fetchFn);
  await insert([...kept, ...found.map((f) => ({ layer: 'sentence', category: f.category, rubric_criterion: 'Conventions', paragraph_index: f.paragraph_index,
    quote: f.quote, anchor_start: f.start, anchor_end: f.end, severity: 'low', summary: f.summary, hints: [], replacements: f.replacements,
    convention: f.convention, source: 'languagetool' } as Row))]);
  return 0;
}
