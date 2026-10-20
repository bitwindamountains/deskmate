import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext(searchParams.get('next')), origin));
  }
  return NextResponse.redirect(new URL('/login?error=callback', origin));
}
