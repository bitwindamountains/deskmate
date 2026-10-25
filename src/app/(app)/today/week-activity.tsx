export type DayCount = { date: string; label: string; short: string; count: number };

const DAY_MS = 86_400_000;

/**
 * B-S1 weekly activity: reviews per day for the last 7 days in the student's zone, oldest first.
 * ponytail: days step back 24 hours from now, so a DST change can merge or skip a local day; fine for a 7-bar glance.
 */
export function weekActivity(reviewedAt: string[], now: Date, zone: string): DayCount[] {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const label = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' });
  const short = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'narrow' });
  const counts = new Map<string, number>();
  for (const t of reviewedAt) {
    const k = key.format(new Date(t));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * DAY_MS);
    const date = key.format(d);
    return { date, label: label.format(d).replace(',', ''), short: short.format(d), count: counts.get(date) ?? 0 };
  });
}

/** Seven thin bars, one series (so no legend), a total, and a table for screen readers. Hidden on an empty week: no pressure. */
export function WeekActivity({ days }: { days: DayCount[] }) {
  const total = days.reduce((n, d) => n + d.count, 0);
  if (!total) return null;
  const max = Math.max(...days.map((d) => d.count));
  return (
    <section aria-labelledby="week-h" className="max-w-prose inlay p-5">
      <h2 id="week-h" className="hand text-2xl">Reviews this week</h2>
      <p className="text-sm text-ink-muted">{total} {total === 1 ? 'review' : 'reviews'} in the last 7 days</p>
      <div aria-hidden className="mt-4 flex h-20 items-end gap-2">
        {days.map((d) => (
          <div key={d.date} title={`${d.label}: ${d.count} ${d.count === 1 ? 'review' : 'reviews'}`} className="flex h-full flex-1 flex-col justify-end">
            <div className="rounded-t bg-chart-review" style={{ height: d.count ? `${Math.max(6, (d.count / max) * 100)}%` : 0 }} />
            <span className="mt-1 border-t border-line pt-1 text-center text-xs text-ink-muted">{d.short}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <thead><tr><th scope="col">Day</th><th scope="col">Reviews</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.date}><td>{d.label}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
