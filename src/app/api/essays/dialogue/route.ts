import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { sendDialogue, type DialogueResult } from '@/lib/essay/dialogue';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

const Body = z.object({ itemId: z.uuid(), kind: z.enum(['question', 'dispute']), message: z.string().trim().min(1).max(1000) });
const ERROR = { 404: 'not_found', 409: 'thread_limit', 429: 'quota', 503: 'busy' } as const;

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

  let r: DialogueResult;
  try {
    r = await sendDialogue(supabase, userId, body.data.itemId, body.data.kind, body.data.message, process.env);
  } catch {
    r = { ok: false, status: 503, message: 'The coach is busy right now. Try again in a minute.' }; // never leak a stack trace or essay text
  }
  if (!r.ok) return NextResponse.json({ error: ERROR[r.status], message: r.message }, { status: r.status });
  return NextResponse.json({ reply: r.reply, verdict: r.verdict, revisedSummary: r.revisedSummary });
}
