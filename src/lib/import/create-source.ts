import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkPages, CHUNK_WORDS, wordCount } from '../../chunk';
import { MAX_PAGES, validateImport, type ImportInput } from './validate';

export type CreateSourceResult = { ok: true; sourceId: string } | { ok: false; error: string };
const SAVE_FAILED = "We couldn't save your material. Please try again.";

/** Trust boundary: re-validates and re-chunks from the submitted pages. Never trusts client chunks. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
export async function insertSource(db: SupabaseClient<any, any, any>, userId: string, input: ImportInput): Promise<CreateSourceResult> {
  const v = validateImport(input);
  if (!v.ok) return v;
  const fail = { ok: false as const, error: SAVE_FAILED };
  let deckId = input.deckId;
  let newDeckId: string | undefined;
  let sourceId: string | undefined;
  const undo = async () => {
    // best effort; deleting the source cascades to its chunks
    try {
      if (sourceId) await db.from('sources').delete().eq('id', sourceId);
      if (newDeckId) await db.from('decks').delete().eq('id', newDeckId);
    } catch { /* best effort */ }
  };
  try {
    if (!deckId) {
      const { data, error } = await db.from('decks')
        .insert({ user_id: userId, title: input.newDeckTitle!.trim(), exam_date: input.examDate || null }).select('id').single();
      if (error || !data) return fail;
      deckId = newDeckId = data.id as string;
    }
    const words = wordCount(input.pages.map((p) => p.text).join(' '));
    const pageCount = input.kind === 'pdf' ? input.pages.length : Math.min(MAX_PAGES, Math.max(1, Math.ceil(words / 500)));
    const { data: src, error: srcErr } = await db.from('sources')
      .insert({ user_id: userId, deck_id: deckId, title: input.title.trim() || 'Pasted text', kind: input.kind, page_count: pageCount,
        card_density: input.cardDensity ?? 'standard', ...(input.cardTypes ? { card_types: input.cardTypes } : {}) }).select('id').single();
    if (srcErr || !src) { await undo(); return fail; }
    sourceId = src.id as string;
    const paged = input.kind === 'pdf'; // pasted text has no pages
    const rows = chunkPages(input.pages, CHUNK_WORDS).map((c) => ({
      user_id: userId, source_id: sourceId, position: c.position, page_start: paged ? c.pageStart : null, page_end: paged ? c.pageEnd : null, text: c.text,
    }));
    const { error: chunkErr } = await db.from('source_chunks').insert(rows);
    if (chunkErr) { await undo(); return fail; }
    return { ok: true, sourceId };
  } catch {
    await undo();
    return fail;
  }
}
