import { NextResponse, type NextRequest } from 'next/server';
import { siteUrl } from '@/lib/auth/site-url';
import { allowStart, cleanupDemos, createDemoAccount, isDemo } from '@/lib/demo/accounts';
import { createClient } from '@/lib/supabase/server';

// Creating and seeding an account takes a few seconds; a cold Render instance adds more.
export const maxDuration = 60;

/** "Try the demo" (a plain form post, so it works without JS): a fresh seeded account, signed in, then Today. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isDemo()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const site = siteUrl();
  const back = (error: string) => NextResponse.redirect(`${site}/login?demo=${error}`, 303);
  if (!site) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  // Another site can't start a demo session in the visitor's browser.
  if (req.headers.get('origin') !== site) return back('failed');
  // Render's proxy appends the real client address last; earlier entries can be forged by the client.
  const ip = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
  if (!allowStart(ip)) return back('busy');

  try {
    await cleanupDemos();
    const { email, password } = await createDemoAccount();
    const supabase = await createClient();
    // Signing in drops any session already in this browser (a previous demo); its account expires on its own.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (e) {
    console.error('demo_start_failed', e instanceof Error ? e.message : 'unknown');
    return back('failed');
  }
  return NextResponse.redirect(`${site}/today`, 303);
}
