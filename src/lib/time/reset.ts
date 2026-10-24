/**
 * Daily limits run on the UTC day: one fixed boundary a student can't shift by changing their time zone.
 * Saying how long is left reads right in every zone, where "midnight UTC" made students do the conversion.
 */
export function resetsIn(now = new Date()): string {
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  const hours = Math.round(ms / 3_600_000);
  return hours < 1 ? 'in under an hour' : `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}
