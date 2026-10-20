import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { generateChunk } from '@/lib/generate/generate-chunk';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

const Body = z.object({ sourceId: z.uuid(), position: z.number().int().min(0) });

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

  let r: Awaited<ReturnType<typeof generateChunk>>;
  try {
    r = await generateChunk(supabase, userId, body.data.sourceId, body.data.position, process.env);
  } catch {
    // never leak a stack trace or DB text; the material is already saved
    return NextResponse.json({ error: 'busy', message: 'The AI service is busy. Your material is saved; try again in a few minutes.' }, { status: 503 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
  return NextResponse.json({ cards: r.cards, droppedUngrounded: r.droppedUngrounded, alreadyGenerated: r.alreadyGenerated });
}
