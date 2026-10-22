export type PrevItem = {
  id: string;
  layer: 'global' | 'paragraph' | 'sentence';
  paragraph_index: number | null;
  quote: string | null;
  summary: string;
  status: 'open' | 'partial' | 'addressed' | 'got_it' | 'disputed' | 'withdrawn';
};
export type CarryPlan = { keep: { id: string; paragraph_index: number }[]; judge: PrevItem[]; changed: number[] };
type Judged = { id: string; status: 'addressed' | 'partial' | 'open' };

/** Paragraphs are matched by content hash, not embeddings: an untouched paragraph keeps its items, anything else is re-judged. */
export function planCarryOver(oldHashes: string[], newHashes: string[], prev: PrevItem[]): CarryPlan {
  const plan: CarryPlan = { keep: [], judge: [], changed: [] };
  for (const item of prev) {
    if (item.status === 'addressed' || item.status === 'withdrawn') continue; // withdrawn: the coach took it back after a dispute
    const at = item.layer !== 'global' && item.paragraph_index !== null ? newHashes.indexOf(oldHashes[item.paragraph_index]) : -1;
    if (at >= 0) plan.keep.push({ id: item.id, paragraph_index: at });
    else plan.judge.push(item);
  }
  newHashes.forEach((h, i) => {
    if (!oldHashes.includes(h)) plan.changed.push(i);
  });
  return plan;
}

/** One status per judged item; the model may omit items (they stay open) or invent ids (ignored). */
export function applyJudgement(plan: CarryPlan, carried: Judged[]): Judged[] {
  const byId = new Map(carried.map((c) => [c.id, c.status]));
  return plan.judge.map((item) => ({ id: item.id, status: byId.get(item.id) ?? 'open' }));
}
