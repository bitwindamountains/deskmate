import type { Db } from '@/lib/llm-calls';

const DAILY_ESSAY_CHECKS = 5; // matches c_daily_limit in scholar_private.consume_essay_quota

/** Essay checks the user has left today (UTC day, like the quota function). RLS scopes the row to the user. */
export async function essayChecksLeft(db: Db): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await db.from('quota_usage').select('essays').eq('day', day).maybeSingle();
  if (error) throw new Error("We couldn't load your essay checks.");
  return Math.max(0, DAILY_ESSAY_CHECKS - ((data?.essays as number | undefined) ?? 0));
}

type EssayRow = { id: string; title: string; drafts: { id: string; version: number }[] };

/** Essays whose latest draft still has open or partly addressed items, with how many of the Top 3 are open; newest first. */
export async function essaysWithOpenPriorities(db: Db): Promise<{ id: string; title: string; openTop3: number }[]> {
  const essays = await db.from('essays').select('id,title,drafts(id,version)').order('updated_at', { ascending: false });
  if (essays.error) throw new Error("We couldn't load your essays.");
  const latest = new Map((essays.data as unknown as EssayRow[]).flatMap((e) => {
    const d = e.drafts.reduce<EssayRow['drafts'][number] | undefined>((a, x) => (!a || x.version > a.version ? x : a), undefined);
    return d ? [[d.id, e] as const] : [];
  }));
  if (!latest.size) return [];
  const items = await db.from('feedback_items').select('draft_id').in('draft_id', [...latest.keys()]).in('status', ['open', 'partial']);
  if (items.error) throw new Error("We couldn't load your essays.");
  const open = new Map<string, number>();
  for (const i of items.data) open.set(i.draft_id as string, (open.get(i.draft_id as string) ?? 0) + 1);
  // Top 3 is the three highest-ranked open items, so the open count among them is at most 3.
  return [...latest].flatMap(([draftId, e]) => (open.get(draftId) ? [{ id: e.id, title: e.title, openTop3: Math.min(3, open.get(draftId)!) }] : []));
}
