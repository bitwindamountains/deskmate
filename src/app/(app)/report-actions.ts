'use server';

import { redirect } from 'next/navigation';
import { reportProblem, type ReportInput } from '@/lib/report/report-problem';
import { createClient } from '@/lib/supabase/server';

export async function sendReport(input: ReportInput): Promise<void> {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  await reportProblem(db, userId, input);
}
