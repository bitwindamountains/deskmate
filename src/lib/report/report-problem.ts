import { z } from 'zod';
import type { Db } from '@/lib/llm-calls';

export const REPORT_REASONS = ['wrong', 'unclear', 'not_in_source', 'grading', 'unfair', 'other'] as const;
const Report = z.object({ target: z.enum(['card', 'feedback_item']), targetId: z.uuid(), reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500) });
export type ReportInput = z.input<typeof Report>;

// The text a report is about, copied so the report still means something after the card is edited or deleted.
const SNAPSHOT = { card: { table: 'cards', cols: 'front,back' }, feedback_item: { table: 'feedback_items', cols: 'summary,revised_summary,quote' } };
const FAILED = "We couldn't send that report.";

/** Brief lines 442 and 853: "Report a problem" on AI output. RLS only accepts a card or item the student owns. */
export async function reportProblem(db: Db, userId: string, input: ReportInput): Promise<void> {
  const v = Report.safeParse(input);
  if (!v.success) throw new Error(FAILED);
  const { table, cols } = SNAPSHOT[v.data.target];
  const { data: snapshot } = await db.from(table).select(cols).eq('id', v.data.targetId).maybeSingle();
  if (!snapshot) throw new Error(FAILED);
  const { error } = await db.from('problem_reports').insert({ user_id: userId, target: v.data.target, target_id: v.data.targetId,
    reason: v.data.reason, note: v.data.note, snapshot });
  if (error) throw new Error(FAILED);
}
