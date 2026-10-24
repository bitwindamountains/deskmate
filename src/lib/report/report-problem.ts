import { z } from 'zod';
import type { Db } from '@/lib/llm-calls';

export const REPORT_REASONS = ['wrong', 'unclear', 'not_in_source', 'grading', 'unfair', 'other'] as const;
const Report = z.object({ target: z.enum(['card', 'feedback_item']), targetId: z.uuid(), reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500) });
export type ReportInput = z.input<typeof Report>;

/**
 * Brief lines 442 and 853: "Report a problem" on AI output. RLS only accepts a card or item the student owns,
 * and a database trigger copies the reported text into `snapshot`.
 */
export async function reportProblem(db: Db, userId: string, input: ReportInput): Promise<void> {
  const v = Report.safeParse(input);
  if (!v.success) throw new Error("We couldn't send that report.");
  const { error } = await db.from('problem_reports')
    .insert({ user_id: userId, target: v.data.target, target_id: v.data.targetId, reason: v.data.reason, note: v.data.note });
  if (error) throw new Error("We couldn't send that report.");
}
