import { cookies } from 'next/headers';
import { safeTimeZone, TZ_COOKIE } from './zone';

const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return undefined; } }; // a malformed cookie must not break the page

/** The student's time zone from the cookie their browser set, checked; UTC until the browser has set it (or outside a request). */
export async function userTimeZone(): Promise<string> {
  try {
    const raw = (await cookies()).get(TZ_COOKIE)?.value;
    return safeTimeZone(raw ? decode(raw) : undefined);
  } catch {
    return 'UTC';
  }
}
