import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { DEFAULT_RUBRIC } from '@/llm/prompts';
import { parseRubric } from './rubric';
import { parseSelfAssessment, type SelfAssessment } from './self-check';
import { ESSAY_TYPES, paragraphHash, paragraphs, validateEssay, type EssayType } from './text';

export type EssayInput = { title: string; essayType: EssayType; gradeLevel: string; assignmentPrompt: string | null;
  citationStyle: string | null; content: string; selfAssessment?: SelfAssessment;
  /** A2.1: the student's rubric as typed, one criterion per line; empty or absent means the default. */
  rubric?: string | null;
  /** Timed writing (A4.5): the limit chosen and the minutes the student used. */
  timedMinutes?: 20 | 30 | 45 | null; minutesUsed?: number | null };
export type CreateEssayResult = { ok: true; essayId: string } | { ok: false; error: string };
export const SAVE_FAILED = "We couldn't save your essay. Please try again.";

const optional = (max: number) => z.string().trim().max(max).nullable().transform((s) => s || null);
// Mirrors the checks on scholar.essays and scholar.drafts.
const Schema = z.object({
  title: z.string().trim().min(1).max(120),
  essayType: z.enum(ESSAY_TYPES),
  gradeLevel: z.string().trim().min(1).max(40),
  assignmentPrompt: optional(4000),
  citationStyle: optional(40),
  content: z.string().max(20_000),
  timedMinutes: z.union([z.literal(20), z.literal(30), z.literal(45)]).nullable().optional(),
  minutesUsed: z.number().int().min(0).max(600).nullable().optional(),
});

/** Trust boundary: re-validates everything and computes the paragraph hashes server-side. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
export async function insertEssay(db: SupabaseClient<any, any, any>, userId: string, input: EssayInput): Promise<CreateEssayResult> {
  const fail = { ok: false as const, error: SAVE_FAILED };
  // Length first, so an over-long paste gets the word-count message rather than the generic one.
  const v = validateEssay(typeof input?.content === 'string' ? input.content : '');
  if (!v.ok) return v;
  const rubric = parseRubric(typeof input?.rubric === 'string' ? input.rubric.slice(0, 4000) : '');
  if (!rubric.ok) return rubric;
  const parsed = Schema.safeParse(input);
  const self = parseSelfAssessment(input?.selfAssessment, rubric.rubric ?? DEFAULT_RUBRIC);
  if (!parsed.success || !self.ok) return fail;
  const i = parsed.data;
  let essayId: string | undefined;
  try {
    const { data, error } = await db.from('essays').insert({
      user_id: userId, title: i.title, essay_type: i.essayType, grade_level: i.gradeLevel,
      assignment_prompt: i.assignmentPrompt, citation_style: i.citationStyle, timed_minutes: i.timedMinutes ?? null, rubric: rubric.rubric,
    }).select('id').single();
    if (error || !data) return fail;
    essayId = data.id as string;
    const paragraph_hashes = await Promise.all(paragraphs(i.content).map(paragraphHash));
    const { data: draft, error: draftErr } = await db.from('drafts')
      .insert({ user_id: userId, essay_id: essayId, version: 1, content: i.content, word_count: v.words, paragraph_hashes,
        minutes_used: i.timedMinutes ? i.minutesUsed ?? null : null }).select('id').single();
    if (draftErr) throw draftErr;
    if (self.value) {
      const { error: selfErr } = await db.from('self_assessments').insert({ draft_id: draft.id, user_id: userId, ...self.value });
      if (selfErr) throw selfErr;
    }
    return { ok: true, essayId };
  } catch {
    // best effort; deleting the essay cascades to its drafts
    if (essayId) await db.from('essays').delete().eq('id', essayId).then(undefined, () => undefined);
    return fail;
  }
}

export type SaveDraftResult = { ok: true; draftId: string; version: number; unchanged?: true } | { ok: false; error: string };
const NOT_FOUND = "We couldn't find that essay.";

/** A revision is a new draft version; drafts are never edited in place (A2.8). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
export async function insertDraft(db: SupabaseClient<any, any, any>, userId: string, essayId: string, content: string): Promise<SaveDraftResult> {
  if (!z.uuid().safeParse(essayId).success || typeof content !== 'string' || content.length > 20_000) return { ok: false, error: SAVE_FAILED };
  const v = validateEssay(content);
  if (!v.ok) return v;
  const paragraph_hashes = await Promise.all(paragraphs(content).map(paragraphHash));
  // Two tabs saving at once both read the same latest version; the loser of the unique (essay_id, version) race retries once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: latest, error } = await db.from('drafts').select('id,version,content').eq('essay_id', essayId)
      .order('version', { ascending: false }).limit(1).maybeSingle();
    if (error) return { ok: false, error: SAVE_FAILED };
    if (!latest) return { ok: false, error: NOT_FOUND }; // RLS: another user's essay looks empty
    if (latest.content === content) return { ok: true, draftId: latest.id as string, version: latest.version as number, unchanged: true };
    const version = (latest.version as number) + 1;
    const { data, error: insErr } = await db.from('drafts')
      .insert({ user_id: userId, essay_id: essayId, version, content, word_count: v.words, paragraph_hashes }).select('id').single();
    if (!insErr && data) {
      await db.from('essays').update({ updated_at: new Date().toISOString() }).eq('id', essayId); // best effort: list order only
      return { ok: true, draftId: data.id as string, version };
    }
    if (insErr?.code !== '23505') return { ok: false, error: SAVE_FAILED };
  }
  return { ok: false, error: SAVE_FAILED };
}
