import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { gradeWithLlm } from '@/lib/grade/grade-with-llm';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

// AI calls with retries and failover; 60 s is the Vercel Hobby limit without Fluid compute.
export const maxDuration = 60;


const Body = z.object({ cardId: z.uuid(), answer: z.string().max(2000) });
const ERRORS = {
  404: { error: 'not_found', message: "We couldn't find that card." },
  429: { error: 'grade_limit', message: "You've had a lot of answers checked today. Rate this one yourself." },
  503: { error: 'busy', message: 'Grading is busy right now. Rate this one yourself.' },
} as const;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: 'unauthorized', message: 'Please sign in again.' }, { status: 401 });
  if (!(await isOnboarded(supabase, userId))) {
    return NextResponse.json({ error: 'not_onboarded', message: 'Finish setting up your account first.' }, { status: 403 });
  }

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'bad_request', message: 'Something went wrong with that request.' }, { status: 400 });

  let r: Awaited<ReturnType<typeof gradeWithLlm>>;
  try {
    r = await gradeWithLlm(supabase, userId, body.data.cardId, body.data.answer, process.env);
  } catch {
    r = { ok: false, status: 503 }; // never leak a stack trace or DB text
  }
  if (!r.ok) return NextResponse.json(ERRORS[r.status], { status: r.status });
  return NextResponse.json({ result: r.result, cached: r.cached });
}
