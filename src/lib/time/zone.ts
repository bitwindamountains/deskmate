/** The cookie the browser stores its IANA time zone in (see TimeZoneCookie). Prefixed: localhost shares cookies across apps. */
export const TZ_COOKIE = 'scholar_tz';

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

const formatters = new Map<string, Intl.DateTimeFormat>(); // building one is slow; zones repeat
function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(zone, f);
  }
  return f;
}

/** The zone's offset from UTC at `at`, in ms (positive east of UTC). */
function offsetMs(zone: string, at: number): number {
  const parts = Object.fromEntries(formatter(zone).formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The local calendar day at `at`, as a UTC midnight timestamp (for comparing days). */
const localDay = (zone: string, at: number) => {
  const local = new Date(at + offsetMs(zone, at));
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
};

/** The instant a calendar day (year, month 1-12, day) starts in `zone`. Day overflow rolls into the next month, as with Date.UTC. */
export function localMidnight(year: number, month: number, day: number, zone: string): Date {
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  // Two passes: the offset at local midnight can differ from the first guess when a DST change falls in between.
  const first = midnightAsUtc - offsetMs(zone, midnightAsUtc);
  const second = midnightAsUtc - offsetMs(zone, first);
  // Where clocks skip midnight itself (Chile, Cuba, Azores), the second pass lands an hour into the day before;
  // the first pass is then the first real moment of the day.
  return new Date(localDay(zone, second) === midnightAsUtc ? second : first);
}

/** The instant the local day containing `now` (plus offsetDays) starts in `zone`, correct across daylight-saving changes. */
export function startOfLocalDay(now: Date, zone: string, offsetDays = 0): Date {
  const local = new Date(now.getTime() + offsetMs(zone, now.getTime()));
  return localMidnight(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate() + offsetDays, zone);
}
