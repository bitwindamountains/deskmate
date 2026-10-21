import Link from 'next/link';

export type EssayStatus = 'Feedback ready' | 'Waiting for feedback' | 'Revising';
export type EssaySummary = { id: string; title: string; status: EssayStatus };

export function essayStatus(drafts: { version: number; layers: Record<string, string> | null }[]): EssayStatus {
  const latest = drafts.reduce<(typeof drafts)[number] | undefined>((a, d) => (!a || d.version > a.version ? d : a), undefined);
  if (latest?.layers?.global === 'done') return 'Feedback ready';
  return drafts.length > 1 ? 'Revising' : 'Waiting for feedback';
}

const NewEssay = ({ className = '' }: { className?: string }) => <Link href="/write/new" className={`btn btn-primary ${className}`}>New essay</Link>;

// Spec §6.5: show the quota in plain words.
function ChecksLeft({ n }: { n: number }) {
  return (
    <p className="mb-6 text-ink-muted">
      {n > 0 ? `${n} essay ${n === 1 ? 'check' : 'checks'} left today` : "You've used today's 5 essay checks. They reset at midnight UTC."}
    </p>
  );
}

export function EssayList({ essays, checksLeft = 5 }: { essays: EssaySummary[]; checksLeft?: number }) {
  if (!essays.length) {
    return (
      <>
        <ChecksLeft n={checksLeft} />
        <section className="max-w-prose rounded-xl border border-line bg-surface p-6">
          <h2 className="text-xl font-bold text-balance">No essays yet</h2>
          <p className="mt-2 text-ink-muted">Paste a draft and get feedback that helps you revise it yourself.</p>
          <NewEssay className="mt-6" />
        </section>
      </>
    );
  }
  return (
    <>
      <ChecksLeft n={checksLeft} />
      <NewEssay className="mb-8" />
      <ul className="max-w-xl space-y-3">
        {essays.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]">
            <Link href={`/write/${e.id}`} className="inline-flex min-h-11 items-center text-xl font-bold text-balance underline">{e.title}</Link>
            <span className="rounded-full border border-line px-3 py-0.5 text-[0.875rem] text-ink-muted">{e.status}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
