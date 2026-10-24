import { diffWords } from 'diff';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppPage } from '@/components/page';
import { rubricOf } from '@/lib/essay/rubric';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import type { Score } from '../essay-view';
import { LAYER_LABEL, STATUS_LABEL } from '../feedback-card';

const LOAD_FAILED = "We couldn't load your essay.";
const version = (v: unknown) => (typeof v === 'string' && /^[1-9]\d{0,5}$/.test(v) ? Number(v) : null);

type Draft = { id: string; version: number; content: string };
type Item = { id: string; layer: keyof typeof LAYER_LABEL; summary: string; revised_summary: string | null; status: string };

export default async function ComparePage({ params, searchParams }: {
  params: Promise<{ essayId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireOnboardedUser();
  const { essayId } = await params;
  const sp = await searchParams;
  const from = version(sp.from), to = version(sp.to);
  if (!z.uuid().safeParse(essayId).success || from === null || to === null) notFound();
  const db = await createClient();
  const [essay, drafts] = await Promise.all([
    db.from('essays').select('id,title,rubric').eq('id', essayId).maybeSingle(),
    db.from('drafts').select('id,version,content').eq('essay_id', essayId).in('version', [from, to]),
  ]);
  if (essay.error || drafts.error) throw new Error(LOAD_FAILED);
  const a = (drafts.data as Draft[]).find((d) => d.version === from);
  const b = (drafts.data as Draft[]).find((d) => d.version === to);
  if (!essay.data || !a || !b) notFound();

  const [analyses, items] = await Promise.all([
    db.from('analyses').select('draft_id,rubric_scores').in('draft_id', [a.id, b.id]),
    db.from('feedback_items').select('id,layer,summary,revised_summary,status').eq('draft_id', a.id).order('created_at'),
  ]);
  if (analyses.error || items.error) throw new Error(LOAD_FAILED);
  const scoresOf = (id: string) => (analyses.data as { draft_id: string; rubric_scores: Score[] }[]).find((x) => x.draft_id === id)?.rubric_scores ?? [];
  const rubricMax: Record<string, number> = Object.fromEntries(rubricOf(essay.data.rubric).map((c) => [c.name, c.maxScore]));
  const sa = scoresOf(a.id), sb = scoresOf(b.id);
  const criteria = [...new Set([...sa, ...sb].map((s) => s.criterion))];
  const cell = (xs: Score[], c: string) => {
    const s = xs.find((x) => x.criterion === c);
    return s ? `${s.score}${rubricMax[c] ? ` of ${rubricMax[c]}` : ''}` : 'Not scored';
  };
  const showScores = profile.preferences?.show_scores !== false;

  return (
    <AppPage current="write" title={essay.data.title} wide>
      <div className="space-y-8">
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Draft {from} to draft {to}</h2>
          <p className="text-ink-muted">Underlined words were added. Struck-through words were removed.</p>
          <Link href={`/write/${essayId}`} className="btn">Back to your essay</Link>
        </div>

        {/* Screen readers rarely announce ins and del, so each change carries its label as text. */}
        <div className="max-w-prose rounded-xl border border-line bg-surface p-5 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {diffWords(a.content, b.content).map((c, i) => (c.added ? (
            <ins key={i} className="font-bold underline decoration-2 underline-offset-2"><span className="sr-only">added </span>{c.value}</ins>
          ) : c.removed ? (
            <del key={i} className="text-ink-muted line-through decoration-2"><span className="sr-only">removed </span>{c.value}</del>
          ) : <span key={i}>{c.value}</span>))}
        </div>

        {showScores && criteria.length > 0 && (
          <section aria-labelledby="scores-h" className="space-y-3">
            <h2 id="scores-h" className="text-xl font-bold">Rubric scores</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse rounded-xl border border-line bg-surface text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="p-3">Criterion</th>
                    <th scope="col" className="p-3">Draft {from}</th>
                    <th scope="col" className="p-3">Draft {to}</th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((c) => (
                    <tr key={c} className="border-b border-line/40 last:border-0">
                      <th scope="row" className="p-3">{c}</th>
                      <td className="p-3">{cell(sa, c)}</td>
                      <td className="p-3">{cell(sb, c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {items.data.length > 0 && (
          <section aria-labelledby="items-h" className="space-y-3">
            <h2 id="items-h" className="text-xl font-bold">Feedback on draft {from}</h2>
            <ul className="divide-y divide-line/40 rounded-xl border border-line bg-surface px-4">
              {(items.data as Item[]).map((it) => (
                <li key={it.id} className="space-y-1 py-3 [overflow-wrap:anywhere]">
                  <p className="text-sm text-ink-muted">{LAYER_LABEL[it.layer]}</p>
                  <p>{it.revised_summary ?? it.summary}</p>
                  <p className="text-sm font-bold">{STATUS_LABEL[it.status] ?? 'Still open'}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppPage>
  );
}
