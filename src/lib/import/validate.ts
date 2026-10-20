import { wordCount, type PageText } from '../../chunk';
import { hasTextLayer } from './pdf';

export const MAX_PAGES = 20;
export const MAX_WORDS = 12_000;
const MAX_CHARS = 200_000; // cheap upper bound for MAX_WORDS, checked first
export type ImportInput = { deckId?: string; newDeckTitle?: string; examDate?: string; title: string; kind: 'pdf' | 'text'; pages: PageText[] };

export function validateImport(i: ImportInput): { ok: true } | { ok: false; error: string } {
  const no = (error: string) => ({ ok: false as const, error });
  const words = () => wordCount(i.pages.map((p) => p.text).join(' '));
  const tooMany = () => no(`That's about ${words().toLocaleString('en-US')} words. The limit is 12,000 at a time; split it into smaller parts.`);
  if (i.pages.reduce((n, p) => n + p.text.length, 0) > MAX_CHARS) return tooMany();
  if (!i.deckId && !i.newDeckTitle?.trim()) return no('Choose a deck or name a new one.');
  if ((i.newDeckTitle?.trim().length ?? 0) > 120) return no('Deck names can be up to 120 characters.');
  if (i.pages.length > MAX_PAGES) return no('Pick up to 20 pages at a time.');
  if (i.kind === 'pdf' && !hasTextLayer(i.pages)) return no('This PDF has no selectable text. Paste the text instead; photo import comes later.');
  if (words() === 0) return no('Add some text to make flashcards from.');
  if (words() > MAX_WORDS) return tooMany();
  return { ok: true };
}
