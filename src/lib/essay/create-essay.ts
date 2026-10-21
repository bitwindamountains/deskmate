import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ESSAY_TYPES, paragraphHash, paragraphs, validateEssay, type EssayType } from './text';

export type EssayInput = { title: string; essayType: EssayType; gradeLevel: string; assignmentPrompt: string | null;
  citationStyle: string | null; content: string };
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
});

/** Trust boundary: re-validates everything and computes the paragraph hashes server-side. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
export async function insertEssay(db: SupabaseClient<any, any, any>, userId: string, input: EssayInput): Promise<CreateEssayResult> {
  const fail = { ok: false as const, error: SAVE_FAILED };
  // Length first, so an over-long paste gets the word-count message rather than the generic one.
  const v = validateEssay(typeof input?.content === 'string' ? input.content : '');
  if (!v.ok) return v;
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return fail;
  const i = parsed.data;
  let essayId: string | undefined;
  try {
    const { data, error } = await db.from('essays').insert({
      user_id: userId, title: i.title, essay_type: i.essayType, grade_level: i.gradeLevel,
      assignment_prompt: i.assignmentPrompt, citation_style: i.citationStyle,
    }).select('id').single();
    if (error || !data) return fail;
    essayId = data.id as string;
    const paragraph_hashes = await Promise.all(paragraphs(i.content).map(paragraphHash));
    const { error: draftErr } = await db.from('drafts')
      .insert({ user_id: userId, essay_id: essayId, version: 1, content: i.content, word_count: v.words, paragraph_hashes });
    if (draftErr) throw draftErr;
    return { ok: true, essayId };
  } catch {
    // best effort; deleting the essay cascades to its drafts
    if (essayId) await db.from('essays').delete().eq('id', essayId).then(undefined, () => undefined);
    return fail;
  }
}
