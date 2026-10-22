import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { analyzeLayer, type AnalyzeResult } from '@/lib/essay/analyze';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

const Body = z.object({ draftId: z.uuid(), layer: z.enum(['global', 'paragraphs', 'sentences']) });

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

  let r: AnalyzeResult;
  try {
    r = await analyzeLayer(supabase, userId, body.data.draftId, body.data.layer, process.env);
  } catch {
    // never leak a stack trace, DB text, or essay text
    return NextResponse.json({ error: 'busy', message: 'Feedback is busy right now. Your essay is saved; try again in a minute.' }, { status: 503 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
  return NextResponse.json({ items: r.items, analysis: r.analysis ?? null, outline: r.outline ?? null, dropped: r.dropped, already: r.already });
}
