import Link from 'next/link';
import { resetsIn } from '@/lib/time/reset';

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
      {n > 0 ? `${n} essay ${n === 1 ? 'check' : 'checks'} left today` : `You've used today's 5 essay checks. They reset ${resetsIn()}.`}
    </p>
  );
}

/** A-S1 growth snapshot; either part may be missing until there is enough writing to say. */
function Snapshot({ strength, workingOn }: { strength: string | null; workingOn: string | null }) {
  if (!strength && !workingOn) return null;
  return (
    <section aria-label="Your writing so far" className="mb-8 max-w-xl inlay p-5">
      {strength && <p>Your strongest area: <strong>{strength}</strong>.</p>}
      {workingOn && <p>Working on: <strong>{workingOn}</strong>. <Link href="/progress" className="underline">See your progress</Link></p>}
    </section>
  );
}

export function EssayList({ essays, checksLeft = 5, snapshot }: { essays: EssaySummary[]; checksLeft?: number;
  snapshot?: { strength: string | null; workingOn: string | null } }) {
  if (!essays.length) {
    return (
      <>
        <ChecksLeft n={checksLeft} />
        <section className="max-w-prose inlay p-6">
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
      {snapshot && <Snapshot {...snapshot} />}
      <ul className="max-w-xl space-y-3">
        {essays.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 inlay p-5 [overflow-wrap:anywhere]">
            <Link href={`/write/${e.id}`} className="inline-flex min-h-11 items-center text-xl font-bold text-balance underline">{e.title}</Link>
            <span className="rounded-[3px] border border-line px-3 py-0.5 text-[0.875rem] text-ink-muted">{e.status}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
