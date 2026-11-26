import { NextResponse, type NextRequest } from 'next/server';
import { requestFeynman, type FeynmanResult } from '@/lib/cards/feynman';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

// AI calls with retries and failover; 60 s is the Vercel Hobby limit without Fluid compute.
export const maxDuration = 60;


const ERROR = { 400: 'bad_request', 404: 'not_found', 429: 'help_limit', 503: 'busy' } as const;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: 'unauthorized', message: 'Please sign in again.' }, { status: 401 });
  if (!(await isOnboarded(supabase, userId))) {
    return NextResponse.json({ error: 'not_onboarded', message: 'Finish setting up your account first.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null); // requestFeynman validates it

  let r: FeynmanResult;
  try {
    r = await requestFeynman(supabase, userId, body, process.env);
  } catch {
    r = { ok: false, status: 503, message: 'Feedback is busy right now. Try again in a minute.' }; // never leak a stack trace or student text
  }
  if (!r.ok) return NextResponse.json({ error: ERROR[r.status], message: r.message }, { status: r.status });
  return NextResponse.json({ feedback: r.feedback });
}
