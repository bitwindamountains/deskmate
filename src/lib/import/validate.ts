import { z } from 'zod';
import { chunkPages, CHUNK_WORDS, hasTextLayer, wordCount, type Chunk, type PageText } from '../../chunk';

export const MAX_PAGES = 20;
export const MAX_WORDS = 12_000;
const MAX_CHARS = 200_000; // cheap upper bound for MAX_WORDS, checked first
// Mirrored by DB checks on scholar.source_chunks (migration 20261020140000).
export const MAX_CHUNKS = 30;
export const MAX_CHUNK_CHARS = 15_000;
export const chunksWithinLimits = (chunks: Chunk[]): boolean =>
  chunks.length <= MAX_CHUNKS && chunks.every((c) => c.text.length <= MAX_CHUNK_CHARS);
export type ImportInput = { deckId?: string; newDeckTitle?: string; examDate?: string; title: string; kind: 'pdf' | 'text'; pages: PageText[];
  cardDensity?: 'fewer' | 'standard' | 'more' };

const Schema = z.object({
  deckId: z.string().uuid().optional(),
  newDeckTitle: z.string().max(120).optional(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d))).optional(),
  title: z.string().min(1).max(120),
  kind: z.enum(['pdf', 'text']),
  pages: z.array(z.object({ page: z.number().int().min(1), text: z.string() })).min(1).max(500),
  cardDensity: z.enum(['fewer', 'standard', 'more']).optional(),
});
const SAVE_FAILED = "We couldn't save your material. Please try again.";

export function validateImport(input: ImportInput): { ok: true } | { ok: false; error: string } {
  const no = (error: string) => ({ ok: false as const, error });
  const raw = input as unknown as { pages?: unknown };
  const chars = Array.isArray(raw?.pages) ? raw.pages.reduce((n: number, p) => n + (typeof p?.text === 'string' ? p.text.length : 0), 0) : 0;
  const tooMany = () => no(`That's about ${wordCount(raw.pages ? (raw.pages as (PageText | null)[]).map((p) => p?.text ?? '').join(' ') : '').toLocaleString('en-US')} words. The limit is 12,000 at a time; split it into smaller parts.`);
  if (chars > MAX_CHARS) return tooMany();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return no(SAVE_FAILED);
  const i = parsed.data;
  if (i.kind === 'text' && i.pages.length !== 1) return no(SAVE_FAILED);
  if (!i.deckId && !i.newDeckTitle?.trim()) return no('Choose a deck or name a new one.');
  if (i.pages.length > MAX_PAGES) return no('Pick up to 20 pages at a time.');
  if (!hasTextLayer(i.pages)) {
    return no(i.kind === 'pdf' ? 'This PDF has no selectable text. Paste the text instead; photo import comes later.' : 'Paste at least a few sentences.');
  }
  if (wordCount(i.pages.map((p) => p.text).join(' ')) > MAX_WORDS) return tooMany();
  if (!chunksWithinLimits(chunkPages(i.pages, CHUNK_WORDS))) return tooMany();
  return { ok: true };
}
