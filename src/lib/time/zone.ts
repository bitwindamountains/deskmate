/** The cookie the browser stores its IANA time zone in (see TimeZoneCookie). */
export const TZ_COOKIE = 'tz';

/** A real IANA zone name, or UTC. The value comes from a cookie the browser sets, so it is checked before use. */
export function safeTimeZone(zone: string | undefined): string {
  if (!zone || zone.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

/** The zone's offset from UTC at `at`, in ms (positive east of UTC). */
function offsetMs(zone: string, at: number): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant the local day containing `now` (plus offsetDays) starts in `zone`, correct across daylight-saving changes. */
export function startOfLocalDay(now: Date, zone: string, offsetDays = 0): Date {
  const local = new Date(now.getTime() + offsetMs(zone, now.getTime()));
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offsetDays);
  // Two passes: the offset at local midnight can differ from the offset now when a DST change falls in between.
  let at = midnightAsUtc - offsetMs(zone, midnightAsUtc);
  at = midnightAsUtc - offsetMs(zone, at);
  return new Date(at);
}
