import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { toAnkiText, toCsv } from '@/lib/cards/csv';
import { createClient } from '@/lib/supabase/server';

const FORMAT = { csv: { type: 'text/csv; charset=utf-8', ext: 'csv' }, anki: { type: 'text/plain; charset=utf-8', ext: 'txt' } } as const;

/** B4.5: a deck's cards as CSV or Anki text, read through RLS. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ deckId: string }> }): Promise<NextResponse> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: 'unauthorized', message: 'Please sign in again.' }, { status: 401 });
  const { deckId } = await params;
  const format = req.nextUrl.searchParams.get('format');
  if (!z.uuid().safeParse(deckId).success || (format !== 'csv' && format !== 'anki')) {
    return NextResponse.json({ error: 'bad_request', message: 'Something went wrong with that request.' }, { status: 400 });
  }
  const [deck, cards] = await Promise.all([
    supabase.from('decks').select('title').eq('id', deckId).maybeSingle(),
    supabase.from('cards').select('front,back,concept,type').eq('deck_id', deckId).in('status', ['kept', 'suspended']).order('created_at'),
  ]);
  if (deck.error || cards.error) return NextResponse.json({ error: 'busy', message: "We couldn't export this deck." }, { status: 503 });
  if (!deck.data) return NextResponse.json({ error: 'not_found', message: "We couldn't find that deck." }, { status: 404 });
  const body = format === 'csv' ? toCsv(cards.data) : toAnkiText(cards.data);
  // Header values must be Latin-1: an ASCII fallback name, plus the real title as RFC 5987 filename*.
  const title = (deck.data.title as string).trim().slice(0, 60);
  const ascii = title.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'deck';
  const ext = FORMAT[format].ext;
  return new NextResponse(body, { headers: { 'content-type': FORMAT[format].type,
    'content-disposition': `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(title)}.${ext}` } });
}
