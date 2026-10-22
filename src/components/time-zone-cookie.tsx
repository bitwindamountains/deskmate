'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { TZ_COOKIE } from '@/lib/time/zone';

/**
 * Tells the server the student's time zone, so "today" (new cards started, cards due) is their day, not the server's UTC day.
 * When the server rendered with a different zone (first visit, or travel), one refresh re-renders the page with the right one.
 */
export function TimeZoneCookie({ serverZone }: { serverZone: string }) {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    if (zone !== serverZone) router.refresh();
  }, [serverZone, router]);
  return null;
}
